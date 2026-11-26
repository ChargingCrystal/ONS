import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeAuth } from '../../composables/__tests__/fake-auth'
import { resetSession } from '../../composables/__tests__/reset-session'
import { useSessionStore } from '../session'

// useSupabaseAuth is the only way to reach Supabase, so replacing it keeps tests offline.
const supabase = vi.hoisted(() => ({ auth: undefined as unknown }))
mockNuxtImport('useSupabaseAuth', () => () => supabase.auth)

let fake: ReturnType<typeof createFakeAuth>

function start(options: Parameters<typeof createFakeAuth>[0] = {}) {
  fake = createFakeAuth(options)
  supabase.auth = fake.auth
  resetSession()
  return useSessionStore()
}

const offline = () => new AuthRetryableFetchError('offline', 0)
const callbackPage = () => `${window.location.origin}/auth/callback`

beforeEach(() => {
  start()
})

describe('restoring a session', () => {
  test('knows nothing before it has asked', () => {
    const session = start({ signedInAs: 'ann@example.org' })
    expect(session.status).toBe('unknown')
    expect(session.isSignedIn).toBe(false)
  })

  test('is signed out when nothing is stored', async () => {
    const session = start()
    await session.init()
    expect(session.status).toBe('signedOut')
    expect(session.user).toBeNull()
  })

  test('restores a stored session', async () => {
    const session = start({ signedInAs: 'ann@example.org' })
    await session.init()
    expect(session.status).toBe('signedIn')
    expect(session.user?.email).toBe('ann@example.org')
  })

  test('asks Supabase only once, even when called twice at the same time', async () => {
    const session = start()
    await Promise.all([session.init(), session.init()])
    await session.init()
    expect(fake.auth.getSession).toHaveBeenCalledTimes(1)
    expect(fake.auth.onAuthStateChange).toHaveBeenCalledTimes(1)
  })

  test('asks again later if Supabase could not be reached', async () => {
    const session = start()
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: offline() })
    await session.init()
    expect(session.status).toBe('signedOut')

    await session.init()
    expect(fake.auth.getSession).toHaveBeenCalledTimes(2)
  })

  test('follows a sign-out that happens elsewhere', async () => {
    const session = start({ signedInAs: 'ann@example.org' })
    await session.init()
    fake.endSession()
    expect(session.status).toBe('signedOut')
    expect(session.signedOutByUser).toBe(false)
  })
})

describe('signing in and registering', () => {
  test('signs in with email and password', async () => {
    const session = start()
    await session.signIn('ann@example.org', 'secret-1')
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ann@example.org', password: 'secret-1' })
    expect(session.status).toBe('signedIn')
  })

  test('reports why a sign-in failed, by code', async () => {
    const session = start()
    fake.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null } as never,
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    })
    await expect(session.signIn('ann@example.org', 'wrong')).rejects.toMatchObject({ code: 'invalid_credentials' })
    expect(session.isSignedIn).toBe(false)
  })

  test('reports an unreachable server as a network problem', async () => {
    const session = start()
    fake.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null, user: null } as never, error: offline() })
    await expect(session.signIn('ann@example.org', 'secret-1')).rejects.toMatchObject({ code: 'network' })
  })

  test('is signed in after registering when no email confirmation is needed', async () => {
    const session = start()
    await expect(session.register('ann@example.org', 'secret-1')).resolves.toBe('signedIn')
    expect(session.status).toBe('signedIn')
  })

  test('asks for email confirmation when Supabase returns no session', async () => {
    const session = start()
    fake.auth.signUp.mockResolvedValueOnce({ data: { session: null, user: { id: '1' } } as never, error: null })

    await expect(session.register('ann@example.org', 'secret-1')).resolves.toBe('confirmationRequired')

    expect(session.isSignedIn).toBe(false)
    expect(fake.auth.signUp).toHaveBeenCalledWith({
      email: 'ann@example.org',
      password: 'secret-1',
      options: { emailRedirectTo: callbackPage() },
    })
  })

  test('starts Google sign-in with the callback page as return address', async () => {
    const session = start()
    await session.signInWithGoogle()
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: callbackPage() },
    })
  })

  test('reports a Google sign-in that cannot start', async () => {
    const session = start()
    fake.auth.signInWithOAuth.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError('Provider is not enabled', 400, 'validation_failed'),
    })
    await expect(session.signInWithGoogle()).rejects.toMatchObject({ code: 'validation_failed' })
  })
})

describe('signing out', () => {
  test('signs out on this device only', async () => {
    const session = start({ signedInAs: 'ann@example.org' })
    await session.init()
    await session.signOut()
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(session.status).toBe('signedOut')
    expect(session.signedOutByUser).toBe(true)
  })

  test('signs out even if the server cannot be reached', async () => {
    const session = start({ signedInAs: 'ann@example.org' })
    await session.init()
    // Supabase removes the local session first and then reports the failed request.
    fake.auth.signOut.mockResolvedValueOnce({ error: offline() })
    await session.signOut()
    expect(session.status).toBe('signedOut')
  })

  test('ends a session that the backend no longer accepts', async () => {
    const session = start({ signedInAs: 'ann@example.org' })
    await session.init()
    await session.expire()
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(session.status).toBe('signedOut')
    expect(session.signedOutByUser).toBe(false)
  })
})

describe('access token', () => {
  test('returns the current token', async () => {
    const session = start({ signedInAs: 'ann@example.org' })
    await expect(session.accessToken()).resolves.toBe('token-1')
  })

  test('returns nothing when signed out', async () => {
    const session = start()
    await expect(session.accessToken()).resolves.toBeNull()
  })

  test('refresh returns a new token', async () => {
    const session = start({ signedInAs: 'ann@example.org' })
    await expect(session.refresh()).resolves.toBe('token-2')
  })

  test('refreshes that run at the same time share one request', async () => {
    const session = start({ signedInAs: 'ann@example.org' })
    const tokens = await Promise.all([session.refresh(), session.refresh()])
    expect(tokens).toEqual(['token-2', 'token-2'])
    expect(fake.auth.refreshSession).toHaveBeenCalledTimes(1)

    // A later refresh is a new request.
    await expect(session.refresh()).resolves.toBe('token-3')
  })

  test('refresh returns nothing when the session cannot be renewed', async () => {
    const session = start({ signedInAs: 'ann@example.org' })
    await session.init()
    fake.auth.refreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthApiError('Invalid refresh token', 400, 'refresh_token_not_found'),
    })
    await expect(session.refresh()).resolves.toBeNull()
  })

  test('refresh keeps the session when the server cannot be reached', async () => {
    const session = start({ signedInAs: 'ann@example.org' })
    await session.init()
    fake.auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: offline() })
    await expect(session.refresh()).rejects.toMatchObject({ code: 'network' })
    expect(session.status).toBe('signedIn')
  })
})

describe('without Supabase configuration', () => {
  test('is signed out, and actions say that sign-in is unavailable', async () => {
    supabase.auth = undefined
    resetSession()
    const session = useSessionStore()

    await session.init()

    expect(session.status).toBe('signedOut')
    await expect(session.signIn('ann@example.org', 'secret-1')).rejects.toMatchObject({ code: 'unavailable' })
    await expect(session.register('ann@example.org', 'secret-1')).rejects.toMatchObject({ code: 'unavailable' })
    await expect(session.signInWithGoogle()).rejects.toMatchObject({ code: 'unavailable' })
    await expect(session.accessToken()).resolves.toBeNull()
  })
})

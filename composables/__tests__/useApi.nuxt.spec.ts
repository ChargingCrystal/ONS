import { mockNuxtImport, registerEndpoint } from '@nuxt/test-utils/runtime'
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { createError, getHeader, getQuery, readBody, setResponseStatus, type H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useSessionStore } from '../../stores/session'
import { apiErrorKey } from '../errorKeys'
import { useApi } from '../useApi'
import { createFakeAuth } from './fake-auth'
import { resetSession } from './reset-session'

const supabase = vi.hoisted(() => ({ auth: undefined as unknown }))
mockNuxtImport('useSupabaseAuth', () => () => supabase.auth)

let fake: ReturnType<typeof createFakeAuth>
// Removes the mocked endpoints of a test.
let removals: (() => void)[] = []

function mockEndpoint(path: string, handler: (event: H3Event) => unknown) {
  const spy = vi.fn(handler)
  removals.push(registerEndpoint(path, spy))
  return spy
}

// An error response in the shape the backend sends: { data: { code } }.
function apiFailure(statusCode: number, code: string) {
  return createError({ statusCode, data: { code } })
}

// Accepts only the given token, like a backend after the old token has expired.
function acceptOnly(token: string) {
  return (event: H3Event) => {
    if (getHeader(event, 'authorization') !== `Bearer ${token}`) {
      throw apiFailure(401, 'unauthorized')
    }
    return { ok: true }
  }
}

const currentRoute = () => useRouter().currentRoute.value

async function signedInOnMapPage() {
  fake = createFakeAuth({ signedInAs: 'ann@example.org' })
  supabase.auth = fake.auth
  resetSession()
  await useRouter().push('/map')
}

beforeEach(async () => {
  await useNuxtApp().$i18n.setLocale('de')
  await signedInOnMapPage()
})

afterEach(() => {
  removals.forEach(remove => remove())
  removals = []
  vi.unstubAllGlobals()
})

describe('requests', () => {
  test('send the access token and ask for JSON', async () => {
    const endpoint = mockEndpoint('/api/space', event => ({
      authorization: getHeader(event, 'authorization'),
      accept: getHeader(event, 'accept'),
    }))

    await expect(useApi()('/api/space')).resolves.toEqual({
      authorization: 'Bearer token-1',
      accept: 'application/json',
    })
    expect(endpoint).toHaveBeenCalledTimes(1)
  })

  test('pass on method, body and query', async () => {
    mockEndpoint('/api/dates', async event => ({
      method: event.method,
      query: getQuery(event),
      body: await readBody(event),
    }))

    await expect(useApi()('/api/dates', { method: 'POST', query: { status: 'done' }, body: { title: 'Picnic' } }))
      .resolves.toEqual({ method: 'POST', query: { status: 'done' }, body: { title: 'Picnic' } })
  })

  test('work with an empty response', async () => {
    mockEndpoint('/api/dates/1', (event) => {
      setResponseStatus(event, 204)
      return null
    })

    await expect(useApi()('/api/dates/1', { method: 'DELETE' })).resolves.toBeFalsy()
  })
})

describe('an expired token (401)', () => {
  test('is renewed once, and the request is repeated', async () => {
    const endpoint = mockEndpoint('/api/space', acceptOnly('token-2'))

    await expect(useApi()('/api/space')).resolves.toEqual({ ok: true })

    expect(fake.auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(endpoint).toHaveBeenCalledTimes(2)
    expect(useSessionStore().isSignedIn).toBe(true)
  })

  test('is renewed only once for requests that run at the same time', async () => {
    mockEndpoint('/api/space', acceptOnly('token-2'))
    const api = useApi()

    await Promise.all([api('/api/space'), api('/api/space'), api('/api/space')])

    expect(fake.auth.refreshSession).toHaveBeenCalledTimes(1)
  })

  test('ends the session when the new token is rejected too', async () => {
    const endpoint = mockEndpoint('/api/space', () => {
      throw apiFailure(401, 'unauthorized')
    })

    await expect(useApi()('/api/space')).rejects.toMatchObject({ code: 'unauthorized', status: 401 })

    expect(endpoint).toHaveBeenCalledTimes(2)
    expect(useSessionStore().isSignedIn).toBe(false)
    expect(currentRoute().path).toBe('/login')
    expect(currentRoute().query.redirect).toBe('/map')
  })

  test('keeps the return page when several requests fail at the same time', async () => {
    mockEndpoint('/api/space', () => {
      throw apiFailure(401, 'unauthorized')
    })
    const api = useApi()

    await Promise.allSettled([api('/api/space'), api('/api/space'), api('/api/space')])

    expect(currentRoute().path).toBe('/login')
    expect(currentRoute().query.redirect).toBe('/map')
  })

  test('ends the session when the token cannot be renewed', async () => {
    const endpoint = mockEndpoint('/api/space', acceptOnly('token-2'))
    fake.auth.refreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthApiError('Invalid refresh token', 400, 'refresh_token_not_found'),
    })

    await expect(useApi()('/api/space')).rejects.toMatchObject({ code: 'unauthorized' })

    expect(endpoint).toHaveBeenCalledTimes(1)
    expect(useSessionStore().isSignedIn).toBe(false)
    expect(currentRoute().path).toBe('/login')
  })

  test('keeps the session when renewing fails because the server is unreachable', async () => {
    mockEndpoint('/api/space', acceptOnly('token-2'))
    fake.auth.refreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthRetryableFetchError('offline', 0),
    })

    await expect(useApi()('/api/space')).rejects.toMatchObject({ messageKey: 'errors.network' })

    expect(useSessionStore().isSignedIn).toBe(true)
    expect(currentRoute().path).toBe('/map')
  })
})

describe('without a session', () => {
  test('goes to the login page without calling the API', async () => {
    const endpoint = mockEndpoint('/api/space', () => ({ ok: true }))
    const api = useApi()
    fake.endSession()
    fake.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

    await expect(api('/api/space')).rejects.toMatchObject({ code: 'unauthorized' })

    expect(endpoint).not.toHaveBeenCalled()
    expect(currentRoute().path).toBe('/login')
  })
})

describe('errors', () => {
  test.each([
    [400, 'invite_invalid'],
    [409, 'already_paired'],
    [403, 'no_space'],
    [404, 'not_found'],
    [400, 'validation_failed'],
    [500, 'internal'],
  ])('%i %s is translated through its code', async (status, code) => {
    mockEndpoint('/api/space', () => {
      throw apiFailure(status, code)
    })

    await expect(useApi()('/api/space')).rejects.toMatchObject({
      name: 'ApiError',
      code,
      status,
      messageKey: apiErrorKey(code),
    })
    expect(currentRoute().path).toBe('/map')
  })

  test('without a code from the backend get the general message', async () => {
    // Hosting limits, for example, answer without the error envelope.
    mockEndpoint('/api/photos', () => {
      throw createError({ statusCode: 413 })
    })

    await expect(useApi()('/api/photos')).rejects.toMatchObject({
      code: undefined,
      status: 413,
      messageKey: 'errors.unexpected',
    })
  })

  test('from an unreachable API are reported as a network problem', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(useApi()('/api/space')).rejects.toMatchObject({ messageKey: 'errors.network' })
  })
})

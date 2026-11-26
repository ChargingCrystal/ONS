import type { Session } from '@supabase/supabase-js'
import { vi } from 'vitest'

// An in-memory stand-in for supabase.auth, limited to the parts the app uses.
// It lives in a __tests__ folder, so Nuxt does not auto-import it.

type Listener = (event: string, session: Session | null) => void

export function fakeSession(email: string, accessToken: string) {
  return {
    access_token: accessToken,
    refresh_token: `refresh-for-${accessToken}`,
    user: { id: `id-of-${email}`, email },
  } as Session
}

// Answers requests the way /auth/v1/settings does: which sign-in providers are switched on.
// Call vi.unstubAllGlobals() after the test.
export function stubProviderSettings(providers: { google: boolean }) {
  const request = vi.fn(async (_url: string, _options?: object) => ({ external: { email: true, ...providers } }))
  vi.stubGlobal('$fetch', request)
  return request
}

export function createFakeAuth(options: { signedInAs?: string } = {}) {
  let issued = 0
  // Every new session gets a new token: token-1, token-2, and so on.
  function newSession(email: string) {
    issued += 1
    return fakeSession(email, `token-${issued}`)
  }

  let session: Session | null = options.signedInAs ? newSession(options.signedInAs) : null
  const listeners = new Set<Listener>()

  function change(event: string, next: Session | null) {
    session = next
    for (const listener of listeners) {
      listener(event, next)
    }
  }

  function signedIn(email: string) {
    change('SIGNED_IN', newSession(email))
    return { data: { session, user: session!.user }, error: null as Error | null }
  }

  const auth = {
    getSession: vi.fn(async () => ({ data: { session }, error: null as Error | null })),
    onAuthStateChange: vi.fn((listener: Listener) => {
      listeners.add(listener)
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } }
    }),
    signInWithPassword: vi.fn(async (credentials: { email: string, password: string }) => signedIn(credentials.email)),
    signUp: vi.fn(async (credentials: { email: string, password: string, options?: object }) => signedIn(credentials.email)),
    signInWithOAuth: vi.fn(async (_request: object) => ({ data: {}, error: null as Error | null })),
    signOut: vi.fn(async (_options?: object) => {
      change('SIGNED_OUT', null)
      return { error: null as Error | null }
    }),
    refreshSession: vi.fn(async () => {
      change('TOKEN_REFRESHED', newSession(session?.user.email ?? 'nobody@example.org'))
      return { data: { session }, error: null as Error | null }
    }),
  }

  return {
    auth,
    // A change that does not start in this tab, for example a sign-out somewhere else.
    endSession: () => change('SIGNED_OUT', null),
  }
}

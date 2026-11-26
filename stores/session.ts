import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js'

export type SessionStatus = 'unknown' | 'signedIn' | 'signedOut'

// A failed sign-in step. Pages translate the code; text from the server is never shown.
export class AuthFailure extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'AuthFailure'
  }
}

function toFailure(error: Error & { code?: string }) {
  // Supabase uses this error type when the server cannot be reached.
  if (isAuthRetryableFetchError(error)) {
    return new AuthFailure('network')
  }
  return new AuthFailure(error.code ?? 'unknown')
}

// Where Google and confirmation emails send people back to. One address for all languages,
// because Supabase only accepts return addresses that are on its allow list.
function callbackUrl() {
  return new URL('/auth/callback', window.location.origin).href
}

export const useSessionStore = defineStore('session', () => {
  const auth = useSupabaseAuth()
  const isProviderEnabled = useProviderCheck()

  const status = ref<SessionStatus>('unknown')
  const user = ref<{ id: string, email: string | undefined } | null>(null)
  // True after somebody pressed "sign out", false when a session ended by itself.
  const signedOutByUser = ref(false)
  const isSignedIn = computed(() => status.value === 'signedIn')

  let loading: Promise<void> | undefined
  let refreshing: Promise<string | null> | undefined
  let stopListening: (() => void) | undefined

  onScopeDispose(() => stopListening?.())

  function apply(session: Session | null) {
    user.value = session ? { id: session.user.id, email: session.user.email } : null
    status.value = session ? 'signedIn' : 'signedOut'
    if (session) {
      signedOutByUser.value = false
    }
  }

  function requireAuth() {
    if (!auth) {
      throw new AuthFailure('unavailable')
    }
    return auth
  }

  async function load() {
    if (!auth) {
      apply(null)
      return
    }
    if (!stopListening) {
      // Keeps the store current, for example after a sign-out in another tab.
      const { data } = auth.onAuthStateChange((_event, session) => apply(session))
      stopListening = () => data.subscription.unsubscribe()
    }
    const { data, error } = await auth.getSession()
    apply(data.session)
    if (error) {
      // Forget this attempt, so that the next call asks again.
      loading = undefined
    }
  }

  // Reads the stored session once. Safe to call from many places.
  function init() {
    loading ??= load()
    return loading
  }

  // The token for API calls. Supabase renews an expired token before returning it.
  async function accessToken() {
    if (!auth) {
      return null
    }
    const { data, error } = await auth.getSession()
    if (error && isAuthRetryableFetchError(error)) {
      throw new AuthFailure('network')
    }
    return data.session?.access_token ?? null
  }

  async function requestNewToken() {
    const { data, error } = await requireAuth().refreshSession()
    if (error && isAuthRetryableFetchError(error)) {
      throw new AuthFailure('network')
    }
    if (error || !data.session) {
      return null
    }
    apply(data.session)
    return data.session.access_token
  }

  // Calls that arrive while a refresh is running wait for that same refresh.
  function refresh() {
    refreshing ??= requestNewToken().finally(() => {
      refreshing = undefined
    })
    return refreshing
  }

  async function signIn(email: string, password: string) {
    const { data, error } = await requireAuth().signInWithPassword({ email, password })
    if (error) {
      throw toFailure(error)
    }
    apply(data.session)
  }

  async function register(email: string, password: string) {
    const { data, error } = await requireAuth().signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl() },
    })
    if (error) {
      throw toFailure(error)
    }
    // Without a session, Supabase waits until the email address is confirmed.
    if (!data.session) {
      return 'confirmationRequired' as const
    }
    apply(data.session)
    return 'signedIn' as const
  }

  // Checked before leaving the app, because afterwards Supabase shows errors itself.
  async function requireProvider(provider: 'google') {
    let enabled: boolean
    try {
      enabled = await isProviderEnabled(provider)
    }
    catch {
      throw new AuthFailure('network')
    }
    if (!enabled) {
      throw new AuthFailure('provider_disabled')
    }
  }

  async function signInWithGoogle() {
    const client = requireAuth()
    await requireProvider('google')
    const { error } = await client.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl() },
    })
    if (error) {
      throw toFailure(error)
    }
  }

  // Signs out this device only; the same account stays signed in elsewhere.
  // Supabase removes the local session even if the server cannot be reached.
  async function endSession() {
    await auth?.signOut({ scope: 'local' })
    apply(null)
  }

  async function signOut() {
    signedOutByUser.value = true
    await endSession()
  }

  // For a session that the backend rejects.
  async function expire() {
    signedOutByUser.value = false
    await endSession()
  }

  return {
    status,
    user,
    isSignedIn,
    signedOutByUser,
    init,
    accessToken,
    refresh,
    signIn,
    register,
    signInWithGoogle,
    signOut,
    expire,
  }
})

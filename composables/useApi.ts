import type { ApiErrorCode } from '../shared/api-errors'

// A failed API call. Show it with t(error.messageKey).
export class ApiError extends Error {
  readonly messageKey: string

  constructor(
    // The backend code, if the response carried one.
    readonly code: ApiErrorCode | undefined,
    // The HTTP status, or undefined if no response arrived.
    readonly status: number | undefined,
    messageKey?: string,
  ) {
    super(code ?? `request failed with status ${status ?? 'unknown'}`)
    this.name = 'ApiError'
    this.messageKey = messageKey ?? apiErrorKey(code)
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | undefined>
  body?: Record<string, unknown> | Blob
  headers?: Record<string, string>
}

// The shape of the errors that $fetch throws.
interface FetchFailure {
  status?: number
  data?: { data?: { code?: ApiErrorCode } }
}

const unauthorized = () => new ApiError('unauthorized', 401)
const networkProblem = () => new ApiError(undefined, undefined, 'errors.network')

function toApiError(error: unknown) {
  const { status, data } = error as FetchFailure
  // Without a status there was no response at all.
  return status ? new ApiError(data?.data?.code, status) : networkProblem()
}

// The only way the app calls /api/*: it adds the access token and handles 401 and errors.
//   const api = useApi()
//   const dates = await api<DateResponse[]>('/api/dates', { query: { status: 'done' } })
export function useApi() {
  const session = useSessionStore()
  const router = useRouter()
  const goToLogin = useLoginRedirect()

  function send<Result>(path: `/api/${string}`, options: ApiOptions, token: string) {
    return $fetch<Result>(path, {
      ...options,
      headers: { ...options.headers, Accept: 'application/json', Authorization: `Bearer ${token}` },
    }) as Promise<Result>
  }

  // The session is over: forget it and ask to sign in again.
  async function leave() {
    const page = router.currentRoute.value
    await session.expire()
    // Another request may already have sent us to the login page.
    // Going there again would lose the page to return to.
    if (router.currentRoute.value.meta.access !== 'guest') {
      await goToLogin(page.fullPath)
    }
    return unauthorized()
  }

  // Returns a token that differs from the rejected one, or null if there is none.
  async function newerToken(rejected: string) {
    // Another request may have renewed the token in the meantime.
    const current = await session.accessToken()
    if (current && current !== rejected) {
      return current
    }
    return session.refresh()
  }

  // Turns problems while talking to Supabase into the same error type.
  async function reachable<Value>(step: Promise<Value>) {
    try {
      return await step
    }
    catch {
      throw networkProblem()
    }
  }

  return async function api<Result>(path: `/api/${string}`, options: ApiOptions = {}): Promise<Result> {
    await session.init()
    const token = await reachable(session.accessToken())
    if (!token) {
      throw await leave()
    }

    try {
      return await send<Result>(path, options, token)
    }
    catch (error) {
      if ((error as FetchFailure).status !== 401) {
        throw toApiError(error)
      }
    }

    // One attempt with a renewed token.
    const renewed = await reachable(newerToken(token))
    if (!renewed) {
      throw await leave()
    }
    try {
      return await send<Result>(path, options, renewed)
    }
    catch (error) {
      if ((error as FetchFailure).status === 401) {
        throw await leave()
      }
      throw toApiError(error)
    }
  }
}

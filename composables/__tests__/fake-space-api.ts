import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody, setResponseStatus, type H3Event } from 'h3'
import { vi } from 'vitest'
import type { SpaceResponse } from '../../shared/api-contract'

// An in-memory stand-in for the space and profile routes, seen by one signed-in person.
// It lives in a __tests__ folder, so Nuxt does not auto-import it.

export const SPACE_ID = '00000000-0000-4000-8000-000000000001'
export const CODE = 'a1'.repeat(16)
export const NEW_CODE = 'b2'.repeat(16)

// The user ids that fake-auth.ts hands out.
export const ANN = 'id-of-ann@example.org'
export const BEN = 'id-of-ben@example.org'

type Member = SpaceResponse['members'][number]

export function member(userId: string, displayName: string | null = null, slot: 1 | 2 = 1): Member {
  return { user_id: userId, slot, display_name: displayName }
}

export function spaceOf(members: Member[], invite: string | null = null): SpaceResponse {
  return { id: SPACE_ID, invite, members }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
type Route = `${Method} /api/${string}`

function noContent(event: H3Event) {
  setResponseStatus(event, 204)
  return null
}

// Registers all routes. Call remove() after the test.
export function fakeSpaceApi() {
  const failures = new Map<Route, { status: number, code: string }[]>()
  const holds = new Map<Route, Promise<void>[]>()
  const removals: (() => void)[] = []

  const backend = {
    // What GET /api/space answers. null means: no space (204).
    space: null as SpaceResponse | null,
    // One spy per route. It receives the request body.
    requests: {} as Record<Route, ReturnType<typeof vi.fn>>,
    // The next request to this route fails the way the API reports errors.
    failOnce(route: Route, status: number, code: string) {
      failures.set(route, [...(failures.get(route) ?? []), { status, code }])
    },
    // Holds back the next answer of this route until the returned function is called.
    holdNext(route: Route) {
      let release = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      holds.set(route, [...(holds.get(route) ?? []), gate])
      return release
    },
    remove() {
      removals.forEach(remove => remove())
    },
  }

  function on(route: Route, answer: (event: H3Event, body: any) => unknown) {
    const [method, path] = route.split(' ') as [Method, string]
    const spy = vi.fn()
    backend.requests[route] = spy
    removals.push(registerEndpoint(path, {
      method,
      handler: async (event) => {
        const body = method === 'POST' || method === 'PUT' ? await readBody(event) : undefined
        spy(body)
        const failure = failures.get(route)?.shift()
        if (failure) {
          throw createError({ statusCode: failure.status, data: { code: failure.code } })
        }
        const gate = holds.get(route)?.shift()
        // A held answer shows the state at the time of the request, not of the release.
        const response = structuredClone(answer(event, body))
        await gate
        return response
      },
    }))
  }

  on('GET /api/space', event => backend.space ?? noContent(event))

  on('POST /api/space', () => {
    backend.space = spaceOf([member(ANN)], CODE)
    return { id: SPACE_ID }
  })

  // Ann joins the space that Ben created.
  on('POST /api/space/join', () => {
    backend.space = spaceOf([member(BEN, 'Ben', 1), member(ANN, null, 2)])
    return { id: SPACE_ID }
  })

  on('POST /api/space/invite', () => {
    backend.space!.invite = NEW_CODE
    return { invite: NEW_CODE }
  })

  on('DELETE /api/space/membership', (event) => {
    backend.space = null
    return noContent(event)
  })

  on('PUT /api/profile', (_event, body) => {
    const me = backend.space?.members.find(candidate => candidate.user_id === ANN)
    if (me) {
      me.display_name = body.display_name
    }
    return { display_name: body.display_name }
  })

  return backend
}

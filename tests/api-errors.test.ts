import { createServer } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import * as h3 from 'h3'
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { apiErrorResponseSchema } from '../shared/api-errors'
import * as contract from '../shared/api-contract'
import * as backend from '../server/utils/backend'

const id = '36ac3324-27c7-4867-91ba-8d73375eacaa'
const invite = '0123456789abcdef0123456789abcdef'
const secret = 'private upstream diagnostic'
const upstream = vi.fn()
let configured = true
const fetchHttp = globalThis.fetch
let server: ReturnType<typeof createServer>
let origin: string

const now = '2026-11-26T10:00:00+00:00'
const coordinates = { lat: 52, lon: 12 }
const partner = { user_id: id, ...coordinates }
const date = { id, space_id: id, title: 'Cinema', category: 'movie', status: 'planned', meeting_at: null, created_at: now }
const space = { id, invite, members: [{ user_id: id, slot: 1 }] }
const dashboard = { serverTime: now, nextMeeting: null, categoriesByMonth: [{ month: '2026-11', category: 'movie', total: 1 }] }
const photo = { id, path: id + '/' + id, fullPath: 'gallery/' + id + '/' + id }

beforeAll(async () => {
  for (const name of ['defineEventHandler', 'createError', 'getHeader', 'getRouterParam', 'getValidatedRouterParams', 'getValidatedQuery', 'readValidatedBody', 'sendNoContent'] as const) {
    vi.stubGlobal(name, h3[name])
  }
  for (const [name, value] of Object.entries(backend)) {
    vi.stubGlobal(name, value)
  }
  vi.stubGlobal('useRuntimeConfig', () => ({
    public: configured ? { supabaseUrl: 'http://supabase.test', supabaseKey: 'public-key' } : {},
  }))
  vi.stubGlobal('fetch', upstream)

  const router = h3.createRouter()
  router.get('/api/health', (await import('../server/api/health.get')).default)
  router.get('/api/space', (await import('../server/api/space/index.get')).default)
  router.post('/api/space', (await import('../server/api/space/index.post')).default)
  router.post('/api/space/join', (await import('../server/api/space/join.post')).default)
  router.get('/api/dates', (await import('../server/api/dates/index.get')).default)
  router.post('/api/dates', (await import('../server/api/dates/index.post')).default)
  router.patch('/api/dates/:id', (await import('../server/api/dates/[id].patch')).default)
  router.delete('/api/dates/:id', (await import('../server/api/dates/[id].delete')).default)
  router.put('/api/location', (await import('../server/api/location.put')).default)
  router.get('/api/location', (await import('../server/api/location.get')).default)
  const lifecycle = import.meta.glob<{ default: h3.EventHandler }>('../server/api/{profile/*,space/invite.post,space/membership.delete,location.delete}.ts')
  for (const [method, path, file] of [
    ['get', '/api/profile', 'profile/index.get'],
    ['put', '/api/profile', 'profile/index.put'],
    ['post', '/api/space/invite', 'space/invite.post'],
    ['delete', '/api/space/membership', 'space/membership.delete'],
    ['delete', '/api/location', 'location.delete'],
  ] as const) {
    const load = lifecycle['../server/api/' + file + '.ts']
    if (load) router[method](path, (await load()).default)
  }
  router.get('/api/dashboard', (await import('../server/api/dashboard.get')).default)
  router.post('/api/photos', (await import('../server/api/photos/index.post')).default)
  router.get('/api/photos', (await import('../server/api/photos/index.get')).default)
  router.delete('/api/photos/:name', (await import('../server/api/photos/[name].delete')).default)
  server = createServer(h3.toNodeListener(h3.createApp().use(router))).listen(0, '127.0.0.1')
  await once(server, 'listening')
  origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
})

afterAll(async () => {
  vi.unstubAllGlobals()
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    })
  }
})

beforeEach(() => {
  configured = true
  upstream.mockReset().mockRejectedValue(new Error(secret))
})

function postgresError(code: string, status: number) {
  upstream.mockResolvedValueOnce(Response.json({ code, message: secret }, { status }))
}

function request(method: string, path: string, body?: BodyInit, token = true, contentType = 'application/json') {
  const headers = new Headers({ accept: 'application/json', 'content-type': contentType })
  if (token) {
    headers.set('authorization', 'Bearer test-token')
  }
  return fetchHttp(origin + '/api' + path, { method, body, headers })
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status)
  const json = await response.json()
  expect(apiErrorResponseSchema.parse(json)).toEqual({ statusCode: status, data: { code } })
  expect(JSON.stringify(json)).not.toContain(secret)
}

test('returns invite_invalid for a well-formed, rejected invite', async () => {
  postgresError('22023', 400)
  await expectError(await request('POST', '/space/join', JSON.stringify({ code: invite })), 400, 'invite_invalid')
})

test.each(['/space', '/space/join'])('returns already_paired for membership conflicts on %s', async (path) => {
  postgresError('23505', 409)
  const body = path.endsWith('/join') ? JSON.stringify({ code: invite }) : undefined
  await expectError(await request('POST', path, body), 409, 'already_paired')
})

test.each([
  ['POST', '/dates', { title: 'Cinema', category: 'movie' }],
  ['PUT', '/location', { lat: 52, lon: 12 }],
] as const)('returns no_space for an unpaired %s %s', async (method, path, body) => {
  upstream.mockImplementation(async input => {
    if (String(input).endsWith('/rpc/my_space')) return Response.json(null)
    return Response.json({ code: '42501', message: secret }, { status: 403 })
  })
  await expectError(await request(method, path, JSON.stringify(body)), 403, 'no_space')
  expect(upstream).toHaveBeenCalledTimes(1)
})

test('returns not_found for a missing or inaccessible date', async () => {
  postgresError('PGRST116', 406)
  await expectError(await request('DELETE', '/dates/' + id), 404, 'not_found')
})

test.each([
  ['PATCH', '/dates/not-a-uuid', '{"title":"Cinema"}'],
  ['DELETE', '/dates/not-a-uuid'],
  ['DELETE', '/photos/not-a-uuid'],
  ['GET', '/dates?offset=-1'],
  ['POST', '/space/join', '{"code":"bad"}'],
  ['POST', '/dates', '{'],
])('returns validation_failed for an invalid %s %s', async (method, path, body) => {
  await expectError(await request(method, path, body), 400, 'validation_failed')
  expect(upstream).not.toHaveBeenCalled()
})

test('returns validation_failed and retains 415 for unsupported photo media', async () => {
  upstream.mockResolvedValueOnce(Response.json(id))
  await expectError(await request('POST', '/photos', 'plain text', true, 'text/plain'), 415, 'validation_failed')
})

test('returns validation_failed and retains 413 for oversized photos', async () => {
  upstream.mockResolvedValueOnce(Response.json(id))
  const body = new Uint8Array(5 * 1024 * 1024 + 1)
  await expectError(await request('POST', '/photos', body, true, 'image/png'), 413, 'validation_failed')
})

test('returns unauthorized for missing and rejected bearer tokens', async () => {
  await expectError(await request('GET', '/dashboard', undefined, false), 401, 'unauthorized')
  expect(upstream).not.toHaveBeenCalled()
  postgresError('PGRST301', 401)
  await expectError(await request('GET', '/dashboard'), 401, 'unauthorized')
})

test('returns internal when Supabase configuration is unavailable', async () => {
  configured = false
  await expectError(await request('GET', '/dashboard'), 503, 'internal')
})

test('returns internal for unexpected upstream errors without claiming a pairing conflict', async () => {
  postgresError('23505', 409)
  await expectError(await request('GET', '/dashboard'), 500, 'internal')
})

test.each([
  ['POST', '/dates', { title: 'Cinema', category: 'Kino' }],
  ['PATCH', '/dates/' + id, { category: 'cinema' }],
  ['GET', '/dates?category=film'],
  ['GET', '/dates?category='],
  ['GET', '/dates?category=%20movie%20'],
] as const)('rejects a non-key category on %s %s before reaching Supabase', async (method, path, body) => {
  if (method === 'POST') {
    upstream.mockResolvedValueOnce(Response.json(id))
  }
  upstream.mockResolvedValueOnce(Response.json(method === 'GET' ? [] : date))
  await expectError(await request(method, path, body ? JSON.stringify(body) : undefined), 400, 'validation_failed')
  expect(upstream).not.toHaveBeenCalled()
})

test.each([
  { method: 'GET', path: '/health', schema: contract.healthResponseSchema, upstreamData: [] },
  { method: 'GET', path: '/space', schema: contract.spaceResponseSchema, upstreamData: [space] },
  { method: 'POST', path: '/space', schema: contract.spaceIdResponseSchema, upstreamData: [id] },
  { method: 'POST', path: '/space/join', schema: contract.spaceIdResponseSchema, upstreamData: [id], body: { code: invite } },
  { method: 'GET', path: '/dates', schema: contract.datesResponseSchema, upstreamData: [[date]] },
  { method: 'POST', path: '/dates', schema: contract.dateResponseSchema, upstreamData: [id, date], body: { title: 'Cinema', category: 'movie' } },
  { method: 'PATCH', path: '/dates/' + id, schema: contract.dateResponseSchema, upstreamData: [date], body: { title: 'Cinema' } },
  { method: 'GET', path: '/location', schema: contract.locationResponseSchema, upstreamData: [[partner]] },
  { method: 'PUT', path: '/location', schema: contract.savedLocationResponseSchema, upstreamData: [id, { ...partner, space_id: id }], body: coordinates },
  { method: 'GET', path: '/dashboard', schema: contract.dashboardResponseSchema, upstreamData: [dashboard] },
  {
    method: 'GET',
    path: '/photos',
    schema: contract.photosResponseSchema,
    upstreamData: [
      id,
      [{ name: id, created_at: now }],
      [{ path: photo.path, error: null, signedURL: '/object/sign/' + photo.fullPath + '?token=test' }],
    ],
  },
])('$method $path matches its shared response schema', async ({ method, path, schema, upstreamData, body }) => {
  for (const data of upstreamData) {
    upstream.mockResolvedValueOnce(Response.json(data))
  }
  const response = await request(method, path, body === undefined ? undefined : JSON.stringify(body))
  expect(response.status).toBe(200)
  schema.parse(await response.json())
})

test('photo uploads match the shared response schema', async () => {
  upstream.mockResolvedValueOnce(Response.json(id))
  upstream.mockImplementationOnce(async input => {
    const key = new URL(String(input)).pathname.split('/object/')[1]
    return Response.json({ Id: photo.id, Key: key })
  })
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1sAAAAASUVORK5CYII=', 'base64'))
  const uploadRequest = contract.uploadPhotoRequestSchema.parse({ body: png, contentType: 'image/png' })
  const response = await request('POST', '/photos', uploadRequest.body, true, uploadRequest.contentType)
  expect(response.status).toBe(200)
  const upload = contract.uploadPhotoResponseSchema.parse(await response.json())
  expect(upload.id).toBe(photo.id)
  expect(upload.path).toMatch(new RegExp('^' + id + '/[a-f0-9-]{36}$'))
  expect(upload.fullPath).toBe('gallery/' + upload.path)
})

test('filters dates by a category key and returns the shared date shape', async () => {
  upstream.mockResolvedValueOnce(Response.json([date]))
  const response = await request('GET', '/dates?category=movie')
  expect(response.status).toBe(200)
  expect(contract.datesResponseSchema.parse(await response.json())).toEqual([date])
  const upstreamUrl = new URL(String(upstream.mock.calls[0][0]))
  expect(upstreamUrl.searchParams.get('category')).toBe('eq.movie')
})

test('returns a profile even before a name is set', async () => {
  upstream.mockResolvedValueOnce(Response.json({ display_name: null }))
  const response = await request('GET', '/profile')
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ display_name: null })
})

test('trims and saves a profile name', async () => {
  upstream.mockResolvedValueOnce(Response.json({ display_name: 'Alex' }))
  const response = await request('PUT', '/profile', '{"display_name":" Alex "}')
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ display_name: 'Alex' })
  expect(JSON.parse(String(upstream.mock.calls[0][1].body))).toEqual({ display_name: 'Alex' })
})

test('rejects blank profile names without querying Supabase', async () => {
  await expectError(await request('PUT', '/profile', '{"display_name":" "}'), 400, 'validation_failed')
  expect(upstream).not.toHaveBeenCalled()
})

test('returns partner display names on the space response', async () => {
  upstream.mockImplementationOnce(async input => {
    const useRpc = String(input).endsWith('/rpc/space_details')
    return Response.json(useRpc ? { ...space, members: [{ ...space.members[0], display_name: 'Alex' }] } : space)
  })
  const response = await request('GET', '/space')
  expect(response.status).toBe(200)
  expect((await response.json()).members[0].display_name).toBe('Alex')
})

test('regenerates invites and returns the new code', async () => {
  upstream.mockResolvedValueOnce(Response.json(invite))
  const response = await request('POST', '/space/invite')
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ invite })
})

test.each([
  ['PT403', 403, 'no_space'],
  ['PT409', 409, 'already_paired'],
] as const)('maps invite rotation failure %s', async (state, status, code) => {
  postgresError(state, status)
  await expectError(await request('POST', '/space/invite'), status, code)
})

test.each(['/space/membership', '/location'])('returns an empty 204 for DELETE %s', async path => {
  upstream.mockResolvedValueOnce(new Response(null, { status: 204 }))
  const response = await request('DELETE', path)
  expect(response.status).toBe(204)
  contract.noContentResponseSchema.parse(await response.text())
})

test.each([
  { method: 'GET', path: '/space', upstreamData: [null] },
  { method: 'DELETE', path: '/dates/' + id, upstreamData: [{ id }] },
  { method: 'DELETE', path: '/photos/' + id, upstreamData: [id, []] },
])('$method $path returns the shared empty response', async ({ method, path, upstreamData }) => {
  for (const data of upstreamData) {
    upstream.mockResolvedValueOnce(Response.json(data))
  }
  const response = await request(method, path)
  expect(response.status).toBe(204)
  contract.noContentResponseSchema.parse(await response.text())
})

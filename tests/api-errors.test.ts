import { createServer } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import * as h3 from 'h3'
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import * as backend from '../server/utils/backend'

const id = '36ac3324-27c7-4867-91ba-8d73375eacaa'
const invite = '0123456789abcdef0123456789abcdef'
const secret = 'private upstream diagnostic'
const upstream = vi.fn()
let configured = true
const fetchHttp = globalThis.fetch
let server: ReturnType<typeof createServer>
let origin: string

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
  router.post('/api/space', (await import('../server/api/space/index.post')).default)
  router.post('/api/space/join', (await import('../server/api/space/join.post')).default)
  router.get('/api/dates', (await import('../server/api/dates/index.get')).default)
  router.post('/api/dates', (await import('../server/api/dates/index.post')).default)
  router.patch('/api/dates/:id', (await import('../server/api/dates/[id].patch')).default)
  router.delete('/api/dates/:id', (await import('../server/api/dates/[id].delete')).default)
  router.put('/api/location', (await import('../server/api/location.put')).default)
  router.get('/api/dashboard', (await import('../server/api/dashboard.get')).default)
  router.post('/api/photos', (await import('../server/api/photos/index.post')).default)
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
  expect(json).toMatchObject({ data: { code } })
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
  ['POST', '/dates', { title: 'Cinema', category: 'film' }],
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

import { afterAll, beforeAll, expect, test, vi } from 'vitest'

const partners = [
  { user_id: 'a', lat: 0, lon: 179 },
  { user_id: 'b', lat: 0, lon: -179 },
]

let readLocation: (event: unknown) => Promise<unknown>
let rows: typeof partners | null

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('client', () => ({
    from: () => ({
      select: () => ({ order: async () => ({ data: rows, error: null }) }),
    }),
  }))
  vi.stubGlobal('result', (response: { data: typeof rows }) => response.data)
  readLocation = (await import('../server/api/location.get')).default
})

afterAll(() => {
  vi.unstubAllGlobals()
})

test.each([[null], [partners.slice(0, 1)]])('returns the available partners with null derived values for %j', async (input) => {
  rows = input
  await expect(readLocation({})).resolves.toEqual({
    partners: input ?? [],
    distanceKm: null,
    midpoint: null,
  })
})

test('returns the two partners with their distance and midpoint across the date line', async () => {
  rows = partners
  const response = await readLocation({}) as {
    partners: typeof partners
    distanceKm: number
    midpoint: { lat: number; lon: number }
  }
  expect(response.partners).toEqual(partners)
  expect(response.distanceKm).toBeCloseTo(222.39, 2)
  expect(response.midpoint.lat).toBeCloseTo(0)
  expect(Math.abs(response.midpoint.lon)).toBeCloseTo(180)
})

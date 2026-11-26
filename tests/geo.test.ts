import { expect, test } from 'vitest'
import { distanceAndMidpoint } from '../server/utils/geo'

test('identical points have zero distance and their own midpoint', () => {
  const point = { lat: 52, lon: 12 }
  const { distanceKm, midpoint } = distanceAndMidpoint(point, point)
  expect(distanceKm).toBe(0)
  expect(midpoint?.lat).toBeCloseTo(52)
  expect(midpoint?.lon).toBeCloseTo(12)
})

test('antipodal points have half the Earth circumference and no unique midpoint', () => {
  const { distanceKm, midpoint } = distanceAndMidpoint({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })
  expect(distanceKm).toBeCloseTo(20015.11, 2)
  expect(midpoint).toBeNull()
})

test('points on opposite sides of the date line meet at the date line', () => {
  const { distanceKm, midpoint } = distanceAndMidpoint({ lat: 0, lon: 179 }, { lat: 0, lon: -179 })
  expect(distanceKm).toBeCloseTo(222.39, 2)
  expect(midpoint?.lat).toBeCloseTo(0)
  expect(Math.abs(midpoint?.lon ?? 0)).toBeCloseTo(180)
})

import { describe, expect, test } from 'vitest'
import { safeRedirect } from '../safeRedirect'

// The "redirect" query parameter can be written by anybody who sends a link.
// It must never lead away from this app.
describe('safeRedirect', () => {
  test.each([
    '/dashboard',
    '/en/map',
    '/dates?status=done#top',
  ])('keeps the path %s', (path) => {
    expect(safeRedirect(path, '/fallback')).toBe(path)
  })

  test.each([
    undefined,
    null,
    '',
    ['/dates', '/map'],
    'dashboard',
    'https://evil.example',
    'javascript:alert(1)',
    '//evil.example',
    '/\\evil.example',
    '\\/evil.example',
    // Browsers drop tabs and line breaks inside addresses.
    '/\t/evil.example',
    '/\n/evil.example',
    // Normalises to a path that starts with two slashes.
    '/.//evil.example',
  ])('rejects %j', (value) => {
    expect(safeRedirect(value, '/fallback')).toBe('/fallback')
  })

  test.each([
    '/login',
    '/en/login?redirect=/map',
    '/register',
    '/nl/register',
    '/auth/callback?code=abc',
    '/dashboard/../login',
  ])('never leads back to a sign-in page: %s', (path) => {
    expect(safeRedirect(path, '/fallback')).toBe('/fallback')
  })
})

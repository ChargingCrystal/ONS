import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, test } from 'vitest'

// Builds the app once and sends real HTTP requests to it.
// This covers what happens when somebody comes back: the server reads the cookie.
await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  browser: false,
})

interface Visitor {
  // Language saved by an earlier visit.
  saved?: string
  // Accept-Language header of the browser.
  browser?: string
}

// Requests one path without following redirects, so the redirect itself can be checked.
async function visit(path: string, { saved, browser }: Visitor = {}) {
  const headers: Record<string, string> = {}
  if (saved) {
    headers.cookie = `ons_locale=${saved}`
  }
  if (browser) {
    headers['accept-language'] = browser
  }
  const response = await fetch(path, { headers, redirect: 'manual' })
  return {
    status: response.status,
    location: response.headers.get('location'),
    cookie: response.headers.get('set-cookie') ?? '',
    body: await response.text(),
  }
}

describe('first visit', () => {
  test('follows the browser language and saves it', async () => {
    const response = await visit('/', { browser: 'nl-NL,nl;q=0.9' })
    expect(response.status).toBe(302)
    expect(response.location).toBe('/nl')
    expect(response.cookie).toContain('ons_locale=nl')
  })

  test('falls back to German for an unsupported browser language', async () => {
    const response = await visit('/', { browser: 'fr-FR' })
    expect(response.status).toBe(200)
    expect(response.body).toContain('lang="de-DE"')
  })
})

describe('returning visit', () => {
  test('the saved language wins over the browser language', async () => {
    const response = await visit('/', { saved: 'en', browser: 'nl-NL' })
    expect(response.location).toBe('/en')
  })

  test('the saved language also applies to a link without a language prefix', async () => {
    const response = await visit('/dates', { saved: 'nl' })
    expect(response.location).toBe('/nl/dates')
  })

  test('a saved German choice stays German in a foreign-language browser', async () => {
    const landing = await visit('/', { saved: 'de', browser: 'en-GB' })
    expect(landing.status).toBe(200)
    expect(landing.body).toContain('lang="de-DE"')

    const appPage = await visit('/dates', { saved: 'de', browser: 'en-GB' })
    expect(appPage.status).toBe(200)
    expect(appPage.location).toBeNull()
  })

  test('a language prefix in the URL wins and becomes the saved language', async () => {
    const response = await visit('/en', { saved: 'nl' })
    expect(response.status).toBe(200)
    expect(response.body).toContain('lang="en-GB"')
    expect(response.cookie).toContain('ons_locale=en')
  })
})

describe('the landing page', () => {
  test.each([
    ['/', 'de-DE', 'Start'],
    ['/en', 'en-GB', 'Home'],
    ['/nl', 'nl-NL', 'Home'],
  ])('%s is rendered on the server in %s', async (path, language, heading) => {
    const response = await visit(path, { saved: language.slice(0, 2) })
    expect(response.status).toBe(200)
    expect(response.body).toContain(`lang="${language}"`)
    expect(response.body).toMatch(new RegExp(`<h1[^>]*>${heading}</h1>`))
    expect(response.body).toContain(`<title>${heading} · Ons</title>`)
  })

  test('contains no SEO link tags yet, because those need a fixed base URL (F10)', async () => {
    const response = await visit('/', { saved: 'de' })
    expect(response.body).not.toMatch(/<link[^>]+rel="(alternate|canonical)"/)
  })
})

describe('app and sign-in pages', () => {
  // Only the browser knows the session, so the server sends an empty page shell.
  test.each([
    '/dashboard',
    '/dates',
    '/map',
    '/photos',
    '/en/dates',
    '/login',
    '/register',
  ])('%s is rendered in the browser only', async (path) => {
    const response = await visit(path, { saved: path.startsWith('/en/') ? 'en' : 'de' })
    expect(response.status).toBe(200)
    expect(response.body).not.toContain('<h1')
  })
})

describe('the sign-in return page', () => {
  // Supabase only returns to addresses on its allow list, so there is just one.
  test.each([
    ['a saved English choice', { saved: 'en', browser: 'en-GB' }],
    ['a saved Dutch choice', { saved: 'nl' }],
    ['a Dutch browser on the first visit', { browser: 'nl-NL' }],
  ])('is not redirected to a language prefix: %s', async (_visitor, visitor) => {
    const response = await visit('/auth/callback?code=abc', visitor)
    expect(response.status).toBe(200)
    expect(response.location).toBeNull()
  })
})

describe('API routes', () => {
  test('are never redirected to a language prefix', async () => {
    const response = await visit('/api/health', { saved: 'nl', browser: 'nl-NL' })
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' })
  })
})

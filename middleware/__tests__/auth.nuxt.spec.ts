import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeAuth } from '../../composables/__tests__/fake-auth'
import { resetSession } from '../../composables/__tests__/reset-session'

const supabase = vi.hoisted(() => ({ auth: undefined as unknown }))
mockNuxtImport('useSupabaseAuth', () => () => supabase.auth)

const someone = 'ann@example.org'

function signInAs(email: string | undefined) {
  supabase.auth = createFakeAuth({ signedInAs: email }).auth
  resetSession()
}

// Navigates like a link click and returns where the app ended up.
async function visit(path: string) {
  await useRouter().push(path)
  return useRouter().currentRoute.value
}

// Every test starts signed out on the German landing page.
beforeEach(async () => {
  signInAs(undefined)
  await useNuxtApp().$i18n.setLocale('de')
  await useRouter().push('/')
})

describe('signed out', () => {
  test.each(['/dashboard', '/dates', '/map', '/photos'])('%s leads to the login page and remembers the target', async (path) => {
    const route = await visit(path)
    expect(route.path).toBe('/login')
    expect(route.query.redirect).toBe(path)
  })

  test.each([
    ['/en/dates', '/en/login'],
    ['/nl/map', '/nl/login'],
  ])('%s keeps its language: %s', async (path, login) => {
    const route = await visit(path)
    expect(route.path).toBe(login)
    expect(route.query.redirect).toBe(path)
  })

  test('remembers the query of the target', async () => {
    const route = await visit('/dates?status=done')
    expect(route.query.redirect).toBe('/dates?status=done')
  })

  test.each(['/', '/en', '/login', '/en/register', '/auth/callback'])('%s is open', async (path) => {
    expect((await visit(path)).path).toBe(path)
  })

  test('protects pages when Supabase is not configured', async () => {
    supabase.auth = undefined
    resetSession()
    expect((await visit('/dashboard')).path).toBe('/login')
  })
})

describe('signed in', () => {
  beforeEach(() => {
    signInAs(someone)
  })

  test.each(['/dashboard', '/dates', '/en/map', '/nl/photos', '/', '/auth/callback'])('%s is open', async (path) => {
    expect((await visit(path)).path).toBe(path)
  })

  test.each([
    ['/login', '/dashboard'],
    ['/register', '/dashboard'],
    ['/en/login', '/en/dashboard'],
  ])('%s leads on to %s', async (path, target) => {
    expect((await visit(path)).path).toBe(target)
  })

  test('the login page leads on to the remembered target', async () => {
    expect((await visit('/login?redirect=/map')).path).toBe('/map')
  })

  test('the login page ignores a target outside the app', async () => {
    expect((await visit('/login?redirect=https://evil.example')).path).toBe('/dashboard')
  })
})

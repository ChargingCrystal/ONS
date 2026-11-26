import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeAuth } from '../../composables/__tests__/fake-auth'
import { resetSession } from '../../composables/__tests__/reset-session'
import CallbackPage from '../auth/callback.vue'

const supabase = vi.hoisted(() => ({ auth: undefined as unknown }))
mockNuxtImport('useSupabaseAuth', () => () => supabase.auth)

enableAutoUnmount(afterEach)

function signInAs(email: string | undefined) {
  supabase.auth = createFakeAuth({ signedInAs: email }).auth
  resetSession()
}

beforeEach(async () => {
  signInAs(undefined)
  await useNuxtApp().$i18n.setLocale('de')
  await useRouter().push('/')
})

// The page Google and confirmation emails come back to.
async function comeBack(address = '/auth/callback?code=abc') {
  const wrapper = await mountSuspended(CallbackPage, { route: address })
  await flushPromises()
  return wrapper
}

const currentPath = () => useRouter().currentRoute.value.path

describe('auth callback page', () => {
  test('has one address for all languages', () => {
    const paths = useRouter().getRoutes().map(route => route.path).filter(path => path.endsWith('/auth/callback'))
    expect(paths).toEqual(['/auth/callback'])
  })

  test('opens the dashboard once Supabase has a session', async () => {
    signInAs('ann@example.org')
    await comeBack()
    await vi.waitFor(() => expect(currentPath()).toBe('/dashboard'))
  })

  test('opens the dashboard in the active language', async () => {
    signInAs('ann@example.org')
    await useNuxtApp().$i18n.setLocale('en')
    await comeBack()
    await vi.waitFor(() => expect(currentPath()).toBe('/en/dashboard'))
  })

  test('asks to sign in when there is no session, for example on another device', async () => {
    const wrapper = await comeBack()
    expect(wrapper.get('[role="alert"]').text()).toContain('nicht automatisch anmelden')
    expect(wrapper.get('a[href="/login"]').text()).toBe('Zur Anmeldung')
  })

  test.each([
    '/auth/callback?error=access_denied&error_description=Secret+details',
    '/auth/callback#error=access_denied&error_description=Secret+details',
  ])('explains a rejected sign-in without showing server text: %s', async (address) => {
    const wrapper = await comeBack(address)
    expect(wrapper.get('[role="alert"]').text()).toContain('abgebrochen oder abgelehnt')
    expect(wrapper.text()).not.toContain('Secret')
  })

  test('says that it is working while Supabase has not answered', async () => {
    const fake = createFakeAuth()
    fake.auth.getSession.mockReturnValue(new Promise(() => {}))
    supabase.auth = fake.auth
    resetSession()

    const wrapper = await comeBack()

    expect(wrapper.get('[role="status"]').text()).toContain('Anmeldung wird abgeschlossen')
  })
})

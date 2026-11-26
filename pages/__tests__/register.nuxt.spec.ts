import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { AuthApiError } from '@supabase/supabase-js'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeAuth } from '../../composables/__tests__/fake-auth'
import { resetSession } from '../../composables/__tests__/reset-session'
import RegisterPage from '../register.vue'
import { button, description, field } from '../../composables/__tests__/form-helpers'

const supabase = vi.hoisted(() => ({ auth: undefined as unknown }))
mockNuxtImport('useSupabaseAuth', () => () => supabase.auth)

enableAutoUnmount(afterEach)

let fake: ReturnType<typeof createFakeAuth>

beforeEach(async () => {
  fake = createFakeAuth()
  supabase.auth = fake.auth
  resetSession()
  await useNuxtApp().$i18n.setLocale('de')
  await useRouter().push('/')
})

const open = (route = '/register') => mountSuspended(RegisterPage, { route, attachTo: document.body })
const currentPath = () => useRouter().currentRoute.value.path

async function register(wrapper: Awaited<ReturnType<typeof open>>, password = 'secret-1') {
  await field(wrapper, 'E-Mail-Adresse').setValue('ann@example.org')
  await field(wrapper, 'Passwort').setValue(password)
  await wrapper.get('form').trigger('submit')
}

describe('registration form', () => {
  test('asks for a new password and states the minimum length beforehand', async () => {
    const wrapper = await open()
    expect(field(wrapper, 'Passwort').attributes('autocomplete')).toBe('new-password')
    expect(description(wrapper, 'Passwort')).toBe('Mindestens 6 Zeichen.')
  })

  test('rejects a password that is too short', async () => {
    const wrapper = await open()

    await register(wrapper, '12345')
    await flushPromises()

    expect(description(wrapper, 'Passwort')).toContain('Das Passwort braucht mindestens 6 Zeichen.')
    expect(field(wrapper, 'Passwort').attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(field(wrapper, 'Passwort').element)
    expect(fake.auth.signUp).not.toHaveBeenCalled()
  })

  test('creates the account and opens the dashboard', async () => {
    const wrapper = await open()
    await register(wrapper)
    await vi.waitFor(() => expect(currentPath()).toBe('/dashboard'))
    expect(fake.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ann@example.org',
      password: 'secret-1',
    }))
  })

  test('returns to the page that asked for the sign-in', async () => {
    const wrapper = await open('/register?redirect=/photos')
    await register(wrapper)
    await vi.waitFor(() => expect(currentPath()).toBe('/photos'))
  })

  test('asks to confirm the email address when Supabase requires it', async () => {
    fake.auth.signUp.mockResolvedValueOnce({ data: { session: null, user: { id: '1' } } as never, error: null })
    const wrapper = await open()

    await register(wrapper)

    await vi.waitFor(() => expect(wrapper.get('[role="status"]').text()).toContain('ann@example.org'))
    expect(wrapper.get('[role="status"]').text()).toContain('Bestätigungslink')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(currentPath()).toBe('/register')
  })

  test('explains that the account already exists', async () => {
    fake.auth.signUp.mockResolvedValueOnce({
      data: { session: null, user: null } as never,
      error: new AuthApiError('User already registered', 422, 'user_already_exists'),
    })
    const wrapper = await open()

    await register(wrapper)

    await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toContain('schon ein Konto'))
  })

  test('offers Google and a link back to the login page', async () => {
    const wrapper = await open()
    await button(wrapper, 'Mit Google fortfahren').trigger('click')
    await flushPromises()
    expect(fake.auth.signInWithOAuth).toHaveBeenCalled()
    expect(wrapper.get('a[href="/login"]').text()).toContain('Anmelden')
  })
})

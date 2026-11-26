import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeAuth } from '../../composables/__tests__/fake-auth'
import { resetSession } from '../../composables/__tests__/reset-session'
import LoginPage from '../login.vue'
import { button, description, field } from '../../composables/__tests__/form-helpers'

const supabase = vi.hoisted(() => ({ auth: undefined as unknown }))
mockNuxtImport('useSupabaseAuth', () => () => supabase.auth)

// The pages are attached to the document so that focus works.
enableAutoUnmount(afterEach)

let fake: ReturnType<typeof createFakeAuth>

beforeEach(async () => {
  fake = createFakeAuth()
  supabase.auth = fake.auth
  resetSession()
  await useNuxtApp().$i18n.setLocale('de')
  await useRouter().push('/')
})

const open = (route = '/login') => mountSuspended(LoginPage, { route, attachTo: document.body })
const currentPath = () => useRouter().currentRoute.value.path
const alertText = (wrapper: Awaited<ReturnType<typeof open>>) => wrapper.find('[role="alert"]').text()

async function signIn(wrapper: Awaited<ReturnType<typeof open>>, email = 'ann@example.org', password = 'secret-1') {
  await field(wrapper, 'E-Mail-Adresse').setValue(email)
  await field(wrapper, 'Passwort').setValue(password)
  await wrapper.get('form').trigger('submit')
}

describe('login form', () => {
  test('has labelled fields that password managers understand', async () => {
    const wrapper = await open()
    expect(field(wrapper, 'E-Mail-Adresse').attributes()).toMatchObject({ type: 'email', autocomplete: 'email' })
    expect(field(wrapper, 'Passwort').attributes()).toMatchObject({ type: 'password', autocomplete: 'current-password' })
    expect(button(wrapper, 'Anmelden').attributes('type')).toBe('submit')
  })

  test('shows errors at the empty fields and focuses the first one', async () => {
    const wrapper = await open()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(description(wrapper, 'E-Mail-Adresse')).toBe('Bitte gib deine E-Mail-Adresse ein.')
    expect(description(wrapper, 'Passwort')).toBe('Bitte gib dein Passwort ein.')
    expect(field(wrapper, 'E-Mail-Adresse').attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(field(wrapper, 'E-Mail-Adresse').element)
    expect(fake.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  test('focuses the password when only that is missing', async () => {
    const wrapper = await open()
    await signIn(wrapper, 'ann@example.org', '')
    await flushPromises()
    expect(document.activeElement).toBe(field(wrapper, 'Passwort').element)
    expect(field(wrapper, 'E-Mail-Adresse').attributes('aria-invalid')).toBeUndefined()
  })

  test('rejects something that is not an email address', async () => {
    const wrapper = await open()
    await signIn(wrapper, 'ann')
    await flushPromises()
    expect(description(wrapper, 'E-Mail-Adresse')).toBe('Das ist keine gültige E-Mail-Adresse.')
    expect(fake.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  test('signs in and opens the dashboard', async () => {
    const wrapper = await open()

    await signIn(wrapper, ' ann@example.org ')

    await vi.waitFor(() => expect(currentPath()).toBe('/dashboard'))
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ann@example.org', password: 'secret-1' })
  })

  test('returns to the page that asked for the sign-in', async () => {
    const wrapper = await open('/login?redirect=/map')
    await signIn(wrapper)
    await vi.waitFor(() => expect(currentPath()).toBe('/map'))
  })

  // Somebody follows a German link, switches to English on the login page and signs in.
  test('continues in the language of the login page', async () => {
    const wrapper = await open('/en/login?redirect=/map')

    await field(wrapper, 'Email address').setValue('ann@example.org')
    await field(wrapper, 'Password').setValue('secret-1')
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(currentPath()).toBe('/en/map'))
  })

  test('translates the return address back to German and keeps its query', async () => {
    const wrapper = await open('/login?redirect=%2Fen%2Fdates%3Fstatus%3Ddone')
    await signIn(wrapper)
    await vi.waitFor(() => expect(useRouter().currentRoute.value.fullPath).toBe('/dates?status=done'))
  })

  test('does not follow a return address outside the app', async () => {
    const wrapper = await open('/login?redirect=//evil.example')
    await signIn(wrapper)
    await vi.waitFor(() => expect(currentPath()).toBe('/dashboard'))
  })

  test('explains wrong credentials without showing server text', async () => {
    fake.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null } as never,
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    })
    const wrapper = await open()

    await signIn(wrapper)

    await vi.waitFor(() => expect(alertText(wrapper)).toBe('E-Mail-Adresse oder Passwort ist falsch.'))
    expect(wrapper.text()).not.toContain('Invalid login credentials')
    expect(currentPath()).toBe('/login')
    expect(button(wrapper, 'Anmelden').attributes('disabled')).toBeUndefined()
  })

  test('explains that the server cannot be reached', async () => {
    fake.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null } as never,
      error: new AuthRetryableFetchError('offline', 0),
    })
    const wrapper = await open()
    await signIn(wrapper)
    await vi.waitFor(() => expect(alertText(wrapper)).toContain('Keine Verbindung zum Server.'))
  })

  test('sends only one request while waiting', async () => {
    let answer: (value: never) => void = () => {}
    fake.auth.signInWithPassword.mockReturnValueOnce(new Promise((resolve) => {
      answer = resolve
    }))
    const wrapper = await open()

    await signIn(wrapper)
    await wrapper.get('form').trigger('submit')

    expect(fake.auth.signInWithPassword).toHaveBeenCalledTimes(1)
    expect(button(wrapper, 'Anmelden').attributes('disabled')).toBeDefined()
    answer({ data: { session: null, user: null }, error: new AuthApiError('no', 400, 'invalid_credentials') } as never)
    await vi.waitFor(() => expect(button(wrapper, 'Anmelden').attributes('disabled')).toBeUndefined())
  })

  test('says so when sign-in is not configured', async () => {
    supabase.auth = undefined
    resetSession()
    const wrapper = await open()
    await signIn(wrapper)
    await vi.waitFor(() => expect(alertText(wrapper)).toBe('Die Anmeldung ist derzeit nicht verfügbar.'))
  })

  test('shows messages in the active language', async () => {
    const wrapper = await open('/en/login')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(description(wrapper, 'Email address')).toBe('Please enter your email address.')
  })

  test('links to registration and keeps the return address', async () => {
    const wrapper = await open('/login?redirect=/map')
    expect(wrapper.get('a[href^="/register"]').attributes('href')).toBe('/register?redirect=/map')
  })
})

describe('Google button', () => {
  test('starts the Google sign-in', async () => {
    const wrapper = await open()

    await button(wrapper, 'Mit Google fortfahren').trigger('click')
    await flushPromises()

    expect(fake.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    // It is not the submit button, so the empty form stays quiet.
    expect(wrapper.find('[aria-invalid]').exists()).toBe(false)
  })

  test('explains when Google sign-in is not available', async () => {
    fake.auth.signInWithOAuth.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError('Unsupported provider', 400, 'validation_failed'),
    })
    const wrapper = await open()

    await button(wrapper, 'Mit Google fortfahren').trigger('click')

    await vi.waitFor(() => expect(alertText(wrapper)).toContain('Die Anmeldung wurde abgelehnt.'))
  })
})

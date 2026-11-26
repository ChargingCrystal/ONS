import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeAuth } from '../../composables/__tests__/fake-auth'
import { button } from '../../composables/__tests__/form-helpers'
import { resetSession } from '../../composables/__tests__/reset-session'
import DefaultLayout from '../default.vue'

const supabase = vi.hoisted(() => ({ auth: undefined as unknown }))
mockNuxtImport('useSupabaseAuth', () => () => supabase.auth)

// The tests attach the layout to the page, so remove it again after each one.
enableAutoUnmount(afterEach)

let fake: ReturnType<typeof createFakeAuth>

function signInAs(email: string | undefined) {
  fake = createFakeAuth({ signedInAs: email })
  supabase.auth = fake.auth
  resetSession()
}

beforeEach(async () => {
  signInAs(undefined)
  await useNuxtApp().$i18n.setLocale('de')
  await useRouter().push('/')
})

async function mountLayout() {
  const wrapper = await mountSuspended(DefaultLayout, {
    route: '/',
    // Focus only works for elements that are part of the document.
    attachTo: document.body,
    slots: { default: () => 'page content' },
  })
  await flushPromises()
  return wrapper
}

const mainNavigation = 'nav[aria-label="Hauptnavigation"]'

describe('default layout', () => {
  test('starts with a skip link to the main content', async () => {
    const wrapper = await mountLayout()
    const first = wrapper.get('a, button, input, select, textarea, [tabindex]')
    expect(first.text()).toBe('Zum Inhalt springen')
    expect(first.attributes('href')).toBe('#main')
  })

  test('the skip link moves keyboard focus into the main content', async () => {
    const wrapper = await mountLayout()
    await wrapper.get('a[href="#main"]').trigger('click')
    expect(document.activeElement).toBe(wrapper.get('main').element)
  })

  test('renders the page inside one focusable main landmark', async () => {
    const wrapper = await mountLayout()
    expect(wrapper.findAll('main')).toHaveLength(1)
    expect(wrapper.get('main').attributes('id')).toBe('main')
    expect(wrapper.get('main').attributes('tabindex')).toBe('-1')
    expect(wrapper.get('main').text()).toContain('page content')
  })

  test.each([
    ['signed out', undefined],
    ['signed in', 'ann@example.org'],
  ])('the language switcher in the header changes the language when %s', async (_state, email) => {
    signInAs(email)
    const wrapper = await mountLayout()

    await wrapper.get('header a[data-locale="en"]').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.get('a[href="#main"]').text()).toBe('Skip to content')
      expect(wrapper.get('header a[data-locale="en"]').attributes('aria-current')).toBe('true')
      expect(useRouter().currentRoute.value.path).toBe('/en')
    })
  })

  test('has a header with a home link and the language switcher', async () => {
    const wrapper = await mountLayout()
    expect(wrapper.get('header a[href="/"]').text()).toBe('Ons')
    expect(wrapper.find('header nav[aria-label="Sprache"]').exists()).toBe(true)
  })

  test('offers signing in, and no app navigation, to signed-out visitors', async () => {
    const wrapper = await mountLayout()
    expect(wrapper.get('header a[href="/login"]').text()).toBe('Anmelden')
    expect(wrapper.find(mainNavigation).exists()).toBe(false)
    expect(wrapper.findAll('header button')).toHaveLength(0)
  })

  test('shows one app navigation and a sign-out button when signed in', async () => {
    signInAs('ann@example.org')
    const wrapper = await mountLayout()
    expect(wrapper.findAll(mainNavigation)).toHaveLength(1)
    expect(button(wrapper, 'Abmelden').attributes('type')).toBe('button')
    expect(wrapper.find('header a[href="/login"]').exists()).toBe(false)
  })

  test('signs out with the button', async () => {
    signInAs('ann@example.org')
    const wrapper = await mountLayout()

    await button(wrapper, 'Abmelden').trigger('click')
    await flushPromises()

    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(wrapper.find(mainNavigation).exists()).toBe(false)
    expect(wrapper.find('header a[href="/login"]').exists()).toBe(true)
  })

  test('shows neither sign-in nor sign-out while the session is still unknown', async () => {
    fake.auth.getSession.mockReturnValue(new Promise(() => {}))
    fake.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: () => true } } })
    const wrapper = await mountLayout()
    expect(wrapper.find('header a[href="/login"]').exists()).toBe(false)
    expect(wrapper.findAll('header button')).toHaveLength(0)
  })
})

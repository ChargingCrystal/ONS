import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeAuth } from '../../composables/__tests__/fake-auth'
import { resetSession } from '../../composables/__tests__/reset-session'
import LanguageSwitcher from '../LanguageSwitcher.vue'

const supabase = vi.hoisted(() => ({ auth: undefined as unknown }))
mockNuxtImport('useSupabaseAuth', () => () => supabase.auth)

// Reads the saved language from the cookie that the server will see on the next visit.
function savedLanguage() {
  return document.cookie.match(/(?:^|; )ons_locale=([^;]*)/)?.[1]
}

// Every test starts on the German home page.
// Somebody is signed in, because some tests visit protected pages.
beforeEach(async () => {
  supabase.auth = createFakeAuth({ signedInAs: 'ann@example.org' }).auth
  resetSession()
  await useNuxtApp().$i18n.setLocale('de')
  await useRouter().push('/')
})

async function mountOn(route: string) {
  const wrapper = await mountSuspended(LanguageSwitcher, { route })
  const link = (code: string) => wrapper.get(`a[data-locale="${code}"]`)
  return { wrapper, link }
}

describe('LanguageSwitcher', () => {
  test('offers German, English and Dutch under their own names', async () => {
    const { wrapper, link } = await mountOn('/')
    expect(wrapper.findAll('a')).toHaveLength(3)
    for (const [code, language, name] of [['de', 'de-DE', 'Deutsch'], ['en', 'en-GB', 'English'], ['nl', 'nl-NL', 'Nederlands']]) {
      // The visible short code is part of the accessible name.
      expect(link(code!).text()).toContain(code!.toUpperCase())
      expect(link(code!).text()).toContain(name)
      // lang makes screen readers pronounce each name correctly.
      expect(link(code!).attributes('lang')).toBe(language)
    }
  })

  test('marks only the active language', async () => {
    const { wrapper, link } = await mountOn('/')
    expect(link('de').attributes('aria-current')).toBe('true')
    expect(wrapper.findAll('[aria-current]')).toHaveLength(1)
  })

  test('links to the same page in each language', async () => {
    const { link } = await mountOn('/dates')
    expect(link('de').attributes('href')).toBe('/dates')
    expect(link('en').attributes('href')).toBe('/en/dates')
    expect(link('nl').attributes('href')).toBe('/nl/dates')
  })

  test('switches texts and URL on click', async () => {
    const { wrapper, link } = await mountOn('/dates')
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Sprache')

    await link('en').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.get('nav').attributes('aria-label')).toBe('Language')
      expect(useRouter().currentRoute.value.path).toBe('/en/dates')
      expect(link('en').attributes('aria-current')).toBe('true')
    })
  })

  test('saves the chosen language', async () => {
    const { link } = await mountOn('/')
    await link('nl').trigger('click')
    await vi.waitFor(() => expect(savedLanguage()).toBe('nl'))
  })

  test('can switch back to German, which has no URL prefix', async () => {
    const { link } = await mountOn('/dates')
    await link('en').trigger('click')
    await vi.waitFor(() => expect(savedLanguage()).toBe('en'))

    await link('de').trigger('click')

    await vi.waitFor(() => {
      expect(savedLanguage()).toBe('de')
      expect(useRouter().currentRoute.value.path).toBe('/dates')
    })
  })

  test('leaves ctrl+click to the browser, so a new tab can be opened', async () => {
    const { link } = await mountOn('/')
    const event = new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true })
    link('en').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(savedLanguage()).toBe('de')
  })
})

import { mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import DefaultLayout from '../default.vue'

// The tests attach the layout to the page, so remove it again after each one.
enableAutoUnmount(afterEach)

beforeEach(async () => {
  await useNuxtApp().$i18n.setLocale('de')
  await useRouter().push('/')
})

function mountLayout() {
  return mountSuspended(DefaultLayout, {
    route: '/',
    // Focus only works for elements that are part of the document.
    attachTo: document.body,
    slots: { default: () => 'page content' },
  })
}

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

  test('the language switcher in the header changes the language of the layout', async () => {
    const wrapper = await mountLayout()

    await wrapper.get('header a[data-locale="en"]').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.get('a[href="#main"]').text()).toBe('Skip to content')
      expect(wrapper.get('header a[data-locale="en"]').attributes('aria-current')).toBe('true')
      expect(useRouter().currentRoute.value.path).toBe('/en')
    })
  })

  test('has a header with home link and language switcher, and one main navigation', async () => {
    const wrapper = await mountLayout()
    expect(wrapper.get('header a[href="/"]').text()).toBe('Ons')
    expect(wrapper.find('header nav[aria-label="Sprache"]').exists()).toBe(true)
    expect(wrapper.findAll('nav[aria-label="Hauptnavigation"]')).toHaveLength(1)
  })
})

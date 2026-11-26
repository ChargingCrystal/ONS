import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { RouterLink } from 'vue-router'
import { createFakeAuth } from '../../composables/__tests__/fake-auth'
import { resetSession } from '../../composables/__tests__/reset-session'
import AppNav from '../AppNav.vue'

const supabase = vi.hoisted(() => ({ auth: undefined as unknown }))
mockNuxtImport('useSupabaseAuth', () => () => supabase.auth)

// Somebody is signed in, because some tests visit protected pages.
beforeEach(async () => {
  supabase.auth = createFakeAuth({ signedInAs: 'ann@example.org' }).auth
  resetSession()
  await useNuxtApp().$i18n.setLocale('de')
  await useRouter().push('/')
})

function mountOn(route: string) {
  return mountSuspended(AppNav, {
    route,
    // mountSuspended replaces RouterLink with a plain <a>. The real one is needed here,
    // because it is what marks the current page.
    global: { stubs: { RouterLink } },
  })
}

describe('AppNav', () => {
  test('is a labelled navigation with one link per main page', async () => {
    const wrapper = await mountOn('/')
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Hauptnavigation')
    expect(wrapper.findAll('a').map(link => link.text())).toEqual(['Start', 'Dates', 'Karte', 'Fotos'])
    expect(wrapper.findAll('a').map(link => link.attributes('href'))).toEqual(['/', '/dates', '/map', '/photos'])
  })

  test('keeps the active language in labels and links', async () => {
    const wrapper = await mountOn('/nl')
    await useNuxtApp().$i18n.setLocale('nl')
    await flushPromises()
    expect(wrapper.findAll('a').map(link => link.text())).toEqual(['Home', 'Dates', 'Kaart', 'Foto\'s'])
    expect(wrapper.findAll('a').map(link => link.attributes('href'))).toEqual(['/nl', '/nl/dates', '/nl/map', '/nl/photos'])
  })

  test('marks only the current page', async () => {
    const wrapper = await mountOn('/dates')
    const current = wrapper.findAll('a[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]!.text()).toBe('Dates')
  })
})

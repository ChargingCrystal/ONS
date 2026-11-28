import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RouterLink } from 'vue-router'
import { createFakeAuth } from '../../composables/__tests__/fake-auth'
import { ANN, BEN, CODE, fakeSpaceApi, member, spaceOf } from '../../composables/__tests__/fake-space-api'
import { resetSpace } from '../../composables/__tests__/reset-space'
import DashboardPage from '../dashboard.vue'

const supabase = vi.hoisted(() => ({ auth: undefined as unknown }))
mockNuxtImport('useSupabaseAuth', () => () => supabase.auth)

enableAutoUnmount(afterEach)

let backend: ReturnType<typeof fakeSpaceApi>

beforeEach(async () => {
  supabase.auth = createFakeAuth({ signedInAs: 'ann@example.org' }).auth
  resetSpace()
  backend = fakeSpaceApi()
  await useNuxtApp().$i18n.setLocale('de')
  await useRouter().push('/')
})

afterEach(() => backend.remove())

async function open() {
  const page = await mountSuspended(DashboardPage, {
    route: '/dashboard',
    // The real link component builds the address.
    global: { stubs: { RouterLink } },
  })
  await vi.waitFor(() => expect(backend.requests['GET /api/space']).toHaveBeenCalled())
  await flushPromises()
  return page
}

describe('dashboard', () => {
  test('invites somebody without a space to set one up', async () => {
    const page = await open()

    await vi.waitFor(() => expect(page.text()).toContain('Erstelle einen gemeinsamen Bereich'))
    expect(page.get('a').text()).toBe('Zum Bereich')
    expect(page.get('a').attributes('href')).toBe('/space')
  })

  test('reminds somebody who is still waiting', async () => {
    backend.space = spaceOf([member(ANN, 'Ann')], CODE)
    const page = await open()

    await vi.waitFor(() => expect(page.text()).toContain('wartet noch auf die zweite Person'))
    expect(page.get('a').attributes('href')).toBe('/space')
  })

  test('says nothing about the space to a pair', async () => {
    backend.space = spaceOf([member(ANN, 'Ann'), member(BEN, 'Ben', 2)])
    const page = await open()

    expect(page.find('a').exists()).toBe(false)
  })

  test('stays quiet when the space cannot be loaded', async () => {
    backend.failLoading()
    const page = await open()

    expect(page.find('a').exists()).toBe(false)
    expect(page.find('[role="alert"]').exists()).toBe(false)
  })
})

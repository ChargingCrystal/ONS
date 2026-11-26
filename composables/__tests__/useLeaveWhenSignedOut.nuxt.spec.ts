import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useSessionStore } from '../../stores/session'
import { useLeaveWhenSignedOut } from '../useLeaveWhenSignedOut'
import { createFakeAuth } from './fake-auth'
import { resetSession } from './reset-session'

const supabase = vi.hoisted(() => ({ auth: undefined as unknown }))
mockNuxtImport('useSupabaseAuth', () => () => supabase.auth)

// Stops the watchers of one test before the next one starts.
enableAutoUnmount(afterEach)

let fake: ReturnType<typeof createFakeAuth>

beforeEach(async () => {
  fake = createFakeAuth({ signedInAs: 'ann@example.org' })
  supabase.auth = fake.auth
  resetSession()
  await useNuxtApp().$i18n.setLocale('de')
  await useRouter().push('/')
})

// Any component that uses the composable; the app calls it once in app.vue.
const Host = defineComponent({
  setup() {
    useLeaveWhenSignedOut()
    return () => null
  },
})

async function openPage(path: string) {
  await mountSuspended(Host, { route: path })
  await useSessionStore().init()
}

const currentRoute = () => useRouter().currentRoute.value

describe('useLeaveWhenSignedOut', () => {
  test('leaves a protected page when the session ends elsewhere, and remembers the page', async () => {
    await openPage('/map')

    fake.endSession()

    await vi.waitFor(() => expect(currentRoute().path).toBe('/login'))
    expect(currentRoute().query.redirect).toBe('/map')
  })

  test('goes to a plain login page after pressing sign out', async () => {
    await openPage('/en/map')

    await useSessionStore().signOut()

    await vi.waitFor(() => expect(currentRoute().path).toBe('/en/login'))
    expect(currentRoute().query.redirect).toBeUndefined()
  })

  test('stays on a public page', async () => {
    await openPage('/')

    fake.endSession()
    await flushPromises()

    expect(currentRoute().path).toBe('/')
  })
})

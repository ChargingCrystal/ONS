import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import type { SpaceResponse } from '../../shared/api-contract'
import { useSessionStore } from '../../stores/session'
import { useSpaceStore } from '../../stores/space'
import { useSpaceAutoRefresh } from '../useSpaceAutoRefresh'
import { createFakeAuth } from './fake-auth'
import { ANN, BEN, CODE, member, spaceOf } from './fake-space-api'
import { resetSpace } from './reset-space'

const supabase = vi.hoisted(() => ({ auth: undefined as unknown }))
mockNuxtImport('useSupabaseAuth', () => () => supabase.auth)

enableAutoUnmount(afterEach)

const waiting = () => spaceOf([member(ANN)], CODE)
const paired = () => spaceOf([member(ANN), member(BEN, 'Ben', 2)])

// Stands in for the loading function, so that these tests only look at the timing.
let refresh: ReturnType<typeof vi.fn<() => Promise<boolean>>>

beforeEach(async () => {
  supabase.auth = createFakeAuth({ signedInAs: 'ann@example.org' }).auth
  resetSpace()
  await useSessionStore().init()
  refresh = vi.fn(async () => true)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// Puts a space into the store, as a finished request would.
function show(space: SpaceResponse | null) {
  useSpaceStore().startRequest().loaded(space)
}

const pass = (milliseconds: number) => vi.advanceTimersByTimeAsync(milliseconds)

// Plain mount: mountSuspended waits for timers, which are faked here.
async function openPage() {
  const page = mount(defineComponent({
    setup() {
      useSpaceAutoRefresh(refresh)
      return () => null
    },
  }))
  await pass(0)
  return page
}

function setTabVisibility(visibility: 'visible' | 'hidden') {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(visibility)
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useSpaceAutoRefresh', () => {
  test('loads the space when the page opens', async () => {
    await openPage()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test('loads again every five seconds while waiting for the partner', async () => {
    show(waiting())
    await openPage()

    await pass(4999)
    expect(refresh).toHaveBeenCalledTimes(1)
    await pass(1)
    expect(refresh).toHaveBeenCalledTimes(2)
    await pass(5000)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  test.each([
    ['there is no space', null],
    ['both are paired', paired()],
  ])('does not poll while %s', async (_case, space) => {
    show(space)
    await openPage()

    await pass(60_000)

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test('starts polling when the waiting begins', async () => {
    show(null)
    await openPage()

    show(waiting())
    await pass(5000)

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  test('stops polling once the partner has joined', async () => {
    show(waiting())
    await openPage()
    refresh.mockImplementationOnce(async () => {
      show(paired())
      return true
    })

    await pass(5000)
    await pass(60_000)

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  test('pauses while the tab is hidden and catches up on the return', async () => {
    show(waiting())
    await openPage()

    setTabVisibility('hidden')
    await pass(60_000)
    expect(refresh).toHaveBeenCalledTimes(1)

    setTabVisibility('visible')
    await pass(0)
    expect(refresh).toHaveBeenCalledTimes(2)
    await pass(5000)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  // A partner can leave at any time; coming back to the window shows it.
  test('loads again when the window gets the focus', async () => {
    show(paired())
    await openPage()

    window.dispatchEvent(new Event('focus'))
    await pass(0)

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  test('never runs two requests at the same time', async () => {
    let finish = (_done: boolean) => {}
    refresh.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      finish = resolve
    }))
    show(waiting())
    await openPage()

    await pass(60_000)
    window.dispatchEvent(new Event('focus'))
    await pass(0)
    expect(refresh).toHaveBeenCalledTimes(1)

    finish(true)
    await pass(5000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  test('leaves no timer and no listener behind when the page is left', async () => {
    show(waiting())
    const page = await openPage()

    page.unmount()

    expect(vi.getTimerCount()).toBe(0)
    window.dispatchEvent(new Event('focus'))
    setTabVisibility('visible')
    await pass(60_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test('does not start again when a request ends after the page was left', async () => {
    let finish = (_done: boolean) => {}
    refresh.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      finish = resolve
    }))
    show(waiting())
    const page = await openPage()

    page.unmount()
    finish(true)
    await pass(60_000)

    expect(vi.getTimerCount()).toBe(0)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

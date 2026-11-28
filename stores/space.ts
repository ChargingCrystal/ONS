import type { SpaceResponse } from '../shared/api-contract'

// A message about the last action, shown above the space screens.
export interface SpaceNotice {
  messageKey: string
  tone: 'info' | 'error'
}

// What the app knows about the space. Requests live in composables/useSpace.ts.
export const useSpaceStore = defineStore('space', () => {
  const session = useSessionStore()

  // undefined: not loaded yet. null: the person has no space.
  const space = ref<SpaceResponse | null>()
  const loadError = ref<string>()
  const notice = ref<SpaceNotice>()

  const state = computed(() => spaceState({
    space: space.value,
    userId: session.user?.id,
    loadError: loadError.value,
  }))

  // Only the answer to the newest request counts.
  let newest = 0

  function startRequest() {
    newest += 1
    const mine = newest
    return {
      loaded(answer: SpaceResponse | null) {
        if (mine === newest) {
          space.value = answer
          loadError.value = undefined
        }
      },
      // discardOld: what is on screen is known to be out of date.
      failed(messageKey: string, { discardOld = false } = {}) {
        if (mine === newest) {
          if (discardOld) {
            space.value = undefined
          }
          loadError.value = messageKey
        }
      },
    }
  }

  function clear() {
    newest += 1
    space.value = undefined
    loadError.value = undefined
    notice.value = undefined
  }

  // The next person on this device must never see the previous space.
  watch(() => session.user?.id, (_id, previous) => {
    // Nothing to forget when the session is read for the first time.
    if (previous !== undefined) {
      clear()
    }
  }, { flush: 'sync' })

  return { state, notice, startRequest, clear }
})

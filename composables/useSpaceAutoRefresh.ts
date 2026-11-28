// TEMPORARY until live updates arrive: F8 "Realtime" in docs/PROMPTS_FRONTEND.md
// (requirement F10). The Realtime channel then replaces this file and its test.
//
// Without it, nobody would see that the partner has joined or left.
export const SPACE_POLL_INTERVAL_MS = 5000

// Keeps the space current while the calling component is on screen:
//   - every few seconds while waiting for a partner, if the tab is visible
//   - once when somebody comes back to the tab or window
export function useSpaceAutoRefresh(refresh: () => Promise<unknown>) {
  const store = useSpaceStore()

  let timer: ReturnType<typeof setTimeout> | undefined
  let onScreen = false
  let requestRunning = false

  function stopTimer() {
    clearTimeout(timer)
    timer = undefined
  }

  // Plans the next request, if one is wanted. There is never more than one timer.
  function plan() {
    stopTimer()
    const wanted = onScreen
      && store.state.status === 'waiting'
      && document.visibilityState === 'visible'
    if (wanted) {
      timer = setTimeout(update, SPACE_POLL_INTERVAL_MS)
    }
  }

  // A slow request is never overtaken: the next one is planned after it has ended.
  async function update() {
    if (requestRunning) {
      return
    }
    requestRunning = true
    stopTimer()
    try {
      await refresh()
    }
    finally {
      requestRunning = false
      plan()
    }
  }

  function onReturn() {
    if (document.visibilityState === 'visible') {
      update()
    }
    else {
      stopTimer()
    }
  }

  watch(() => store.state.status, () => {
    if (!requestRunning) {
      plan()
    }
  })

  onMounted(() => {
    onScreen = true
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    update()
  })

  onBeforeUnmount(() => {
    onScreen = false
    stopTimer()
    document.removeEventListener('visibilitychange', onReturn)
    window.removeEventListener('focus', onReturn)
  })
}

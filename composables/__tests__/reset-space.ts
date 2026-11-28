import { useNuxtApp } from '#app'
import { useSpaceStore } from '../../stores/space'
import { resetSession } from './reset-session'

// The Nuxt test app lives for a whole test file, so each test needs fresh stores.
// The space store goes first, because it watches the session store.
export function resetSpace() {
  const store = useSpaceStore()
  store.$dispose()
  delete (useNuxtApp().$pinia as { state: { value: Record<string, unknown> } }).state.value.space
  resetSession()
}

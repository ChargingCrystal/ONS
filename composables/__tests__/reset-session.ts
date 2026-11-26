import { useNuxtApp } from '#app'
import { useSessionStore } from '../../stores/session'

// The Nuxt test app lives for a whole test file, so each test needs a fresh session store.
export function resetSession() {
  const store = useSessionStore()
  store.$dispose()
  delete (useNuxtApp().$pinia as { state: { value: Record<string, unknown> } }).state.value.session
}

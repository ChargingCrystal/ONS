// Every page needs a signed-in user, unless it says otherwise:
//   definePageMeta({ access: 'public' })  everybody
//   definePageMeta({ access: 'guest' })   only signed-out visitors (login, register)
declare module '#app' {
  interface PageMeta {
    access?: 'public' | 'guest'
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
  // The session lives in the browser, so the server cannot judge it.
  // Protected pages are rendered in the browser only (see routeRules in nuxt.config.ts).
  if (import.meta.server) {
    return
  }
  // Public pages and unknown addresses (404) need no check.
  if (to.meta.access === 'public' || to.matched.length === 0) {
    return
  }

  // Composables must be called before the first "await".
  const session = useSessionStore()
  const localePath = useLocalePath()
  const goToLogin = useLoginRedirect()
  // Route names end in the language, for example "dates___en".
  const language = String(to.name).split('___')[1] as 'de' | 'en' | 'nl' | undefined

  await session.init()

  if (to.meta.access === 'guest') {
    if (session.isSignedIn) {
      return navigateTo(safeRedirect(to.query.redirect, localePath('/dashboard', language)))
    }
    return
  }

  if (!session.isSignedIn) {
    return goToLogin(to.fullPath, language)
  }
})

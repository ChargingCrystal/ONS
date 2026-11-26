// The one way to send somebody to the login page.
export function useLoginRedirect() {
  const localePath = useLocalePath()

  // returnTo is the page to come back to after signing in.
  // language is needed during a navigation, before the app has switched to the target language.
  return function goToLogin(returnTo?: string, language?: 'de' | 'en' | 'nl') {
    return navigateTo({
      path: localePath('/login', language),
      query: returnTo ? { redirect: returnTo } : {},
    })
  }
}

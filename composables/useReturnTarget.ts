// Where to go after signing in: the page named in "?redirect=", or else the dashboard,
// in the language of the page the person signed in on.
export function useReturnTarget() {
  const router = useRouter()
  const localePath = useLocalePath()
  const routeBaseName = useRouteBaseName()

  // language is needed during a navigation, before the app has switched to it.
  return function returnTarget(requested: unknown, language?: 'de' | 'en' | 'nl') {
    const path = safeRedirect(requested, '')
    if (!path) {
      return localePath('/dashboard', language)
    }
    const target = router.resolve(path)
    // The page name without its language, for example "map". Unknown addresses have none.
    const name = routeBaseName(target)
    if (!name) {
      return path
    }
    return localePath({ name, params: target.params, query: target.query, hash: target.hash }, language)
  }
}

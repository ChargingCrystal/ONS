// Leaves a protected page as soon as its session ends: after "sign out",
// after a sign-out in another tab, or when the session expires. app.vue calls this once.
export function useLeaveWhenSignedOut() {
  const session = useSessionStore()
  const router = useRouter()
  const goToLogin = useLoginRedirect()

  watch(() => session.status, (status, previous) => {
    const route = router.currentRoute.value
    // Pages that set "access" are open to signed-out visitors.
    if (previous !== 'signedIn' || status !== 'signedOut' || route.meta.access) {
      return
    }
    // After pressing "sign out" nobody expects to be brought back to this page.
    goToLogin(session.signedOutByUser ? undefined : route.fullPath)
  })
}

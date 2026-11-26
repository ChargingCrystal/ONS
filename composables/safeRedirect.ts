// Pages that are part of signing in, with or without a language prefix.
const signInPage = /^(\/(en|nl))?\/(login|register|auth)(\/|$)/

// A made-up address that only serves to resolve paths. It never receives a request.
const base = 'http://app.invalid'

// Returns the "redirect" query value if it is a path inside this app, otherwise the fallback.
// Anybody can write that value into a link, so everything unusual is rejected.
export function safeRedirect(value: unknown, fallback: string): string {
  // A path inside the app starts with exactly one slash and contains no backslash.
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback
  }
  // URL parsing removes tabs, line breaks and "..", the same way the browser does.
  const url = new URL(value, base)
  if (url.origin !== base || url.pathname.startsWith('//') || signInPage.test(url.pathname)) {
    return fallback
  }
  return `${url.pathname}${url.search}${url.hash}`
}

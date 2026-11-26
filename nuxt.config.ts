import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  modules: ['@nuxtjs/i18n', '@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  i18n: {
    // German URLs have no prefix (/dates), the others do (/en/dates, /nl/dates).
    strategy: 'prefix_except_default',
    defaultLocale: 'de',
    // Message files are in i18n/locales/.
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-GB', name: 'English', file: 'en.json' },
      { code: 'nl', language: 'nl-NL', name: 'Nederlands', file: 'nl.json' },
    ],
    // First visit: browser language, otherwise German. Later visits: the saved cookie.
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'ons_locale',
      redirectOn: 'no prefix',
      fallbackLocale: 'de',
    },
  },
  // The sign-in session lives in the browser, so pages are rendered there.
  // Only the public landing page is rendered on the server, for search engines.
  routeRules: {
    '/**': { ssr: false },
    '/': { ssr: true },
    '/en': { ssr: true },
    '/nl': { ssr: true },
  },
  runtimeConfig: { public: { supabaseUrl: '', supabaseKey: '' } }
})

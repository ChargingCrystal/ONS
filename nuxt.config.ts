import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  modules: ['@nuxtjs/i18n'],
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
  runtimeConfig: { public: { supabaseUrl: '', supabaseKey: '' } }
})

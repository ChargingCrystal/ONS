<script setup lang="ts">
const { t, localeProperties } = useI18n()

// Sends people away from protected pages when their session ends.
useLeaveWhenSignedOut()

// Keeps <html lang> in step with the active language (screen readers, browser translation).
// SEO tags such as hreflang are left out until F10, because they need a fixed base URL.
useHead({
  htmlAttrs: {
    lang: () => localeProperties.value.language,
    dir: () => localeProperties.value.dir ?? 'ltr',
  },
  titleTemplate: title => (title ? `${title} · ${t('app.name')}` : t('app.name')),
  meta: [
    // viewport-fit=cover lets the layout use the safe areas of phones with a home indicator.
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
  ],
})
</script>

<template>
  <!-- Reads the new page title to screen reader users after a navigation. -->
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

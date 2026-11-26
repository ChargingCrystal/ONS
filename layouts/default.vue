<script setup lang="ts">
const { t } = useI18n()
const session = useSessionStore()

// Public pages are not checked by the middleware, so the header asks for the session
// here. "onMounted" runs only in the browser, after the page is on screen.
onMounted(() => session.init())
</script>

<template>
  <div class="min-h-dvh">
    <SkipLink target="main" />
    <header class="border-b border-line bg-surface">
      <div class="mx-auto flex max-w-content flex-wrap items-center justify-between gap-2 px-4 py-2">
        <NuxtLinkLocale
          to="/"
          class="flex min-h-touch min-w-touch items-center font-heading text-xl"
        >
          {{ t('app.name') }}
        </NuxtLinkLocale>
        <div class="flex flex-wrap items-center gap-2">
          <LanguageSwitcher />
          <SessionControls />
        </div>
      </div>
    </header>
    <!-- Shown to signed-in users only. This is convenience; the middleware protects the pages. -->
    <AppNav v-if="session.isSignedIn" />
    <!-- tabindex="-1" lets the skip link move focus here. -->
    <main
      id="main"
      tabindex="-1"
      class="mx-auto max-w-content px-4 py-6"
      :class="{ 'pb-nav md:pb-6': session.isSignedIn }"
    >
      <slot />
    </main>
  </div>
</template>

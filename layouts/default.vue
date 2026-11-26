<script setup lang="ts">
const { t } = useI18n()
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
        <LanguageSwitcher />
      </div>
    </header>
    <AppNav />
    <!-- tabindex="-1" lets the skip link move focus here. -->
    <main
      id="main"
      tabindex="-1"
      class="mx-auto max-w-content px-4 py-6 pb-nav md:pb-6"
    >
      <slot />
    </main>
  </div>
</template>

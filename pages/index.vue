<script setup lang="ts">
const { t } = useI18n()

useHead({ title: () => t('pages.home.title') })
</script>

<template>
  <section>
    <h1 class="text-2xl">{{ t('pages.home.title') }}</h1>
    <p class="mt-2 text-muted">{{ t('pages.home.intro') }}</p>
    <a
      href="/api/health"
      class="mt-4 inline-flex min-h-touch items-center text-accent underline"
    >{{ t('pages.home.backendStatus') }}</a>
  </section>
</template>

<script setup lang="ts">
// Start page after signing in. Placeholder until the dashboard (F7, F8) is built.
const { t } = useI18n()

useHead({ title: () => t('pages.dashboard.title') })
</script>

<template>
  <section>
    <h1 class="text-2xl">{{ t('pages.dashboard.title') }}</h1>
    <p class="mt-2 text-muted">{{ t('common.comingSoon') }}</p>
    <SpaceHint />
  </section>
</template>

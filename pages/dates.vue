<script setup lang="ts">
// Placeholder until the dates list (F4, F5) is built.
const { t } = useI18n()

useHead({ title: () => t('pages.dates.title') })
</script>

<template>
  <section>
    <h1 class="text-2xl">{{ t('pages.dates.title') }}</h1>
    <p class="mt-2 text-muted">{{ t('common.comingSoon') }}</p>
  </section>
</template>

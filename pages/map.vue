<script setup lang="ts">
// Placeholder until the map (F6) is built.
const { t } = useI18n()

useHead({ title: () => t('pages.map.title') })
</script>

<template>
  <section>
    <h1 class="text-2xl">{{ t('pages.map.title') }}</h1>
    <p class="mt-2 text-muted">{{ t('common.comingSoon') }}</p>
  </section>
</template>

<script setup lang="ts">
// Placeholder until the photo gallery (F3) is built.
const { t } = useI18n()

useHead({ title: () => t('pages.photos.title') })
</script>

<template>
  <section>
    <h1 class="text-2xl">{{ t('pages.photos.title') }}</h1>
    <p class="mt-2 text-muted">{{ t('common.comingSoon') }}</p>
  </section>
</template>

<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ access: 'guest' })
useHead({ title: () => t('pages.login.title') })
</script>

<template>
  <section>
    <h1 class="text-2xl">{{ t('pages.login.title') }}</h1>
  </section>
</template>

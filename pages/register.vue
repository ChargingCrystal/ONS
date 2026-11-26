<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ access: 'guest' })
useHead({ title: () => t('pages.register.title') })
</script>

<template>
  <section>
    <h1 class="text-2xl">{{ t('pages.register.title') }}</h1>
    <CredentialsForm mode="register" />
  </section>
</template>

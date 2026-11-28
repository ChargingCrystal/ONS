<script setup lang="ts">
// On the dashboard: points to the space page as long as there is no partner.
// It shows nothing while loading, after a failed load, and to a pair.
const { t } = useI18n()
const { state, refresh } = useSpace()

onMounted(() => refresh())

const textKey = computed(() => {
  if (state.value.status === 'none') {
    return 'space.hint.none'
  }
  if (state.value.status === 'waiting') {
    return 'space.hint.waiting'
  }
  return undefined
})
</script>

<template>
  <aside
    v-if="textKey"
    class="mt-4 flex max-w-form flex-col gap-2 rounded-md border border-field bg-surface p-4"
  >
    <p>{{ t(textKey) }}</p>
    <NuxtLinkLocale
      to="/space"
      class="inline-flex min-h-touch items-center font-strong text-accent underline"
    >
      {{ t('space.hint.link') }}
    </NuxtLinkLocale>
  </aside>
</template>

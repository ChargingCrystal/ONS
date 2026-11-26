<script setup lang="ts">
const props = defineProps<{
  // id of the element that receives focus
  target: string
}>()

// The link is visually hidden until it receives keyboard focus.
const { t } = useI18n()

// Moving focus in code behaves the same in every browser and leaves the URL unchanged.
function focusTarget() {
  document.getElementById(props.target)?.focus()
}
</script>

<template>
  <a
    :href="`#${props.target}`"
    class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:rounded-md focus:bg-accent focus:px-4 focus:py-3 focus:text-on-accent"
    @click.prevent="focusTarget"
  >{{ t('a11y.skipToContent') }}</a>
</template>

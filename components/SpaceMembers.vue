<script setup lang="ts">
import type { SpaceMember } from '../composables/spaceState'

// Both display names. There is no partner while waiting.
const props = defineProps<{
  me: SpaceMember
  partner?: SpaceMember
}>()

const { t } = useI18n()
</script>

<template>
  <section class="flex flex-col gap-3">
    <h2 class="text-xl">{{ t('space.members.title') }}</h2>
    <dl class="flex flex-col gap-4">
      <div>
        <dt class="text-sm text-muted">{{ t('space.members.you') }}</dt>
        <dd><SpaceOwnName :name="props.me.display_name" /></dd>
      </div>
      <div v-if="props.partner">
        <dt class="text-sm text-muted">{{ t('space.members.partner') }}</dt>
        <!-- break-words: a long name without spaces must not widen the page. -->
        <dd
          v-if="props.partner.display_name"
          class="text-lg break-words"
        >
          {{ props.partner.display_name }}
        </dd>
        <dd
          v-else
          class="text-muted"
        >
          {{ t('space.members.nameMissing') }}
        </dd>
      </div>
    </dl>
  </section>
</template>

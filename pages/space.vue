<script setup lang="ts">
// Pairing (F1): create or join a space, see both names, leave it again.
const { t } = useI18n()
const store = useSpaceStore()
const { state, notice, refresh } = useSpace()

// Loads the space now and keeps it current while this page is open.
useSpaceAutoRefresh(refresh)

useHead({ title: () => t('pages.space.title') })

const heading = useTemplateRef<HTMLHeadingElement>('heading')

// Empty after a failed load: the error message says what happened.
const statusText = computed(() => {
  const status = state.value.status
  return status === 'failed' ? '' : t(`space.status.${status}`)
})

// When the screen changes, the element that had the focus may disappear.
// The focus then moves to the heading instead of getting lost.
watch(() => state.value.status, async (_status, previous) => {
  if (previous === 'loading') {
    return
  }
  await nextTick()
  const focused = document.activeElement
  if (!focused || focused === document.body || !focused.isConnected) {
    heading.value?.focus({ preventScroll: true })
  }
})

// A message belongs to this visit only.
onBeforeUnmount(() => {
  store.notice = undefined
})
</script>

<template>
  <section>
    <!-- tabindex="-1" lets the script above move the focus here. -->
    <h1
      ref="heading"
      tabindex="-1"
      class="text-2xl"
    >
      {{ t('pages.space.title') }}
    </h1>
    <!-- Stays in the page, so that screen readers announce every change. -->
    <p
      role="status"
      class="mt-2 text-muted"
    >
      {{ statusText }}
    </p>

    <p
      v-if="notice"
      :role="notice.tone === 'error' ? 'alert' : 'status'"
      class="mt-4 max-w-form rounded-md bg-surface p-4"
      :class="notice.tone === 'error' ? 'border-2 border-danger text-danger' : 'border border-field'"
    >
      {{ t(notice.messageKey) }}
    </p>

    <div
      v-if="state.status === 'failed'"
      class="mt-4 flex max-w-form flex-col gap-4"
    >
      <p
        role="alert"
        class="rounded-md border-2 border-danger bg-surface p-4 text-danger"
      >
        {{ t(state.messageKey) }}
      </p>
      <button
        type="button"
        class="min-h-touch rounded-md bg-accent px-4 font-strong text-on-accent"
        @click="refresh"
      >
        {{ t('space.retry') }}
      </button>
    </div>

    <SpaceStart
      v-else-if="state.status === 'none'"
      class="mt-6"
    />

    <div
      v-else-if="state.status === 'waiting' || state.status === 'paired'"
      class="mt-6 flex max-w-form flex-col gap-8"
    >
      <SpaceInvite
        v-if="state.status === 'waiting'"
        :invite="state.invite"
      />
      <!-- The same element in both states, so a half-typed name survives the change. -->
      <SpaceMembers
        :me="state.me"
        :partner="state.status === 'paired' ? state.partner : undefined"
      />
      <SpaceLeave :alone="state.status === 'waiting'" />
    </div>
  </section>
</template>

<script setup lang="ts">
// Leaving the space, after a confirmation that says what really happens.
const props = defineProps<{
  // True if nobody stays behind.
  alone: boolean
}>()

const { t } = useI18n()
const { leave, checkBeforeLeaving } = useSpace()

const id = useId()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const opener = useTemplateRef<HTMLButtonElement>('opener')
const pending = ref(false)

async function ask() {
  if (pending.value) {
    return
  }
  pending.value = true
  // The warning depends on the current members, so they are loaded first.
  const canAsk = await checkBeforeLeaving()
  pending.value = false
  if (canAsk) {
    await nextTick()
    // A modal dialog keeps the focus inside and closes with Escape.
    dialog.value?.showModal()
  }
}

function close() {
  dialog.value?.close()
}

// Runs for every way of closing: both buttons and the Escape key.
async function returnFocus() {
  await nextTick()
  opener.value?.focus()
}

async function confirm() {
  if (pending.value) {
    return
  }
  pending.value = true
  await leave()
  pending.value = false
  // After success this component is gone; after a failure the dialog has to close.
  close()
}
</script>

<template>
  <div class="border-t border-line pt-6">
    <!-- aria-disabled, because a disabled button would lose the keyboard focus. -->
    <button
      ref="opener"
      type="button"
      :aria-disabled="pending"
      class="min-h-touch rounded-md border-2 border-danger bg-surface px-4 font-strong text-danger aria-disabled:cursor-wait aria-disabled:faded"
      @click="ask"
    >
      {{ t('space.leave.open') }}
    </button>

    <!--
      "m-auto" centres the dialog again, because Tailwind removes the default margin.
      The dialog itself is invisible; its padding keeps the box away from the screen edges.
    -->
    <dialog
      ref="dialog"
      :aria-labelledby="`${id}-title`"
      :aria-describedby="`${id}-text`"
      class="m-auto bg-transparent p-4"
      @close="returnFocus"
    >
      <div class="max-w-form rounded-lg border border-field bg-surface p-4 text-ink">
        <h2
          :id="`${id}-title`"
          class="text-xl"
        >
          {{ t('space.leave.title') }}
        </h2>
        <p
          :id="`${id}-text`"
          class="mt-3"
        >
          {{ props.alone ? t('space.leave.alone') : t('space.leave.paired') }}
        </p>
        <div class="mt-4 flex flex-wrap justify-end gap-2">
          <!-- First and focused: the harmless choice. -->
          <button
            type="button"
            autofocus
            class="min-h-touch rounded-md border border-field bg-surface px-4 font-strong"
            @click="close"
          >
            {{ t('space.leave.cancel') }}
          </button>
          <button
            type="button"
            :aria-disabled="pending"
            class="min-h-touch rounded-md border-2 border-danger bg-surface px-4 font-strong text-danger aria-disabled:cursor-wait aria-disabled:faded"
            @click="confirm"
          >
            {{ t('space.leave.confirm') }}
          </button>
        </div>
      </div>
    </dialog>
  </div>
</template>

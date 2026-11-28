<script setup lang="ts">
// For somebody without a space: create one, or join one with an invite code.
const { t } = useI18n()
const { create, join } = useSpace()

const code = ref('')
// A message key, so the text follows a language change.
const codeError = ref<string>()
const pending = ref(false)
const codeField = useTemplateRef('codeField')

async function createSpace() {
  if (pending.value) {
    return
  }
  pending.value = true
  await create()
  pending.value = false
}

async function joinSpace() {
  if (pending.value) {
    return
  }
  pending.value = true
  codeError.value = undefined
  const outcome = await join(code.value)
  pending.value = false
  codeError.value = outcome.fieldError
  if (outcome.fieldError) {
    // Focus the field once it is marked as invalid.
    await nextTick()
    codeField.value?.focus()
  }
}
</script>

<template>
  <div class="flex max-w-form flex-col gap-8">
    <section class="flex flex-col gap-3">
      <h2 class="text-xl">{{ t('space.create.title') }}</h2>
      <p class="text-muted">{{ t('space.create.hint') }}</p>
      <!-- aria-disabled, because a disabled button would lose the keyboard focus. -->
      <button
        type="button"
        :aria-disabled="pending"
        class="min-h-touch rounded-md bg-accent px-4 font-strong text-on-accent aria-disabled:cursor-wait aria-disabled:faded"
        @click="createSpace"
      >
        {{ t('space.create.button') }}
      </button>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="text-xl">{{ t('space.join.title') }}</h2>
      <!-- novalidate: the app shows its own messages, in the chosen language. -->
      <form
        class="flex flex-col gap-4"
        method="post"
        novalidate
        @submit.prevent="joinSpace"
      >
        <FormField
          ref="codeField"
          v-model="code"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :label="t('space.join.code')"
          :hint="t('space.join.hint')"
          :error="codeError ? t(codeError) : undefined"
        />
        <button
          type="submit"
          :aria-disabled="pending"
          class="min-h-touch rounded-md border border-field bg-surface px-4 font-strong aria-disabled:cursor-wait aria-disabled:faded"
        >
          {{ t('space.join.button') }}
        </button>
      </form>
    </section>
  </div>
</template>

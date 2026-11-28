<script setup lang="ts">
// The own display name. The form is open until a name is saved, and later on request.
const props = defineProps<{
  name: string | null
}>()

const { t } = useI18n()
const { saveName } = useSpace()

const editing = ref(false)
const draft = ref(props.name ?? '')
// A message key, so the text follows a language change.
const error = ref<string>()
const pending = ref(false)
const nameField = useTemplateRef('nameField')
const changeButton = useTemplateRef<HTMLButtonElement>('changeButton')

const showForm = computed(() => editing.value || !props.name)

async function edit() {
  draft.value = props.name ?? ''
  error.value = undefined
  editing.value = true
  await nextTick()
  nameField.value?.focus()
}

async function close() {
  editing.value = false
  await nextTick()
  changeButton.value?.focus()
}

async function save() {
  if (pending.value) {
    return
  }
  pending.value = true
  error.value = undefined
  const outcome = await saveName(draft.value)
  pending.value = false
  if (outcome.ok) {
    await close()
    return
  }
  error.value = outcome.fieldError
  if (outcome.fieldError) {
    await nextTick()
    nameField.value?.focus()
  }
}
</script>

<template>
  <form
    v-if="showForm"
    class="mt-1 flex flex-col gap-3"
    method="post"
    novalidate
    @submit.prevent="save"
  >
    <FormField
      ref="nameField"
      v-model="draft"
      type="text"
      autocomplete="nickname"
      :label="t('space.name.label')"
      :hint="t('space.name.hint', { max: DISPLAY_NAME_MAX })"
      :error="error ? t(error, { max: DISPLAY_NAME_MAX }) : undefined"
    />
    <div class="flex flex-wrap gap-2">
      <button
        type="submit"
        :disabled="pending"
        class="min-h-touch rounded-md bg-accent px-4 font-strong text-on-accent disabled:cursor-wait disabled:faded"
      >
        {{ t('space.name.save') }}
      </button>
      <!-- Without a saved name there is nothing to go back to. -->
      <button
        v-if="props.name"
        type="button"
        class="min-h-touch rounded-md border border-field bg-surface px-4 font-strong"
        @click="close"
      >
        {{ t('space.name.cancel') }}
      </button>
    </div>
  </form>

  <div
    v-else
    class="flex flex-wrap items-center justify-between gap-2"
  >
    <span class="min-w-0 text-lg break-words">{{ props.name }}</span>
    <button
      ref="changeButton"
      type="button"
      class="min-h-touch rounded-md border border-field bg-surface px-4 font-strong"
      @click="edit"
    >
      {{ t('space.name.change') }}
    </button>
  </div>
</template>

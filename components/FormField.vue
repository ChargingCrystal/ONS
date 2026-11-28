<script setup lang="ts">
// A labelled input with an optional hint and an error message.
// Screen readers hear hint and error through aria-describedby.
const props = defineProps<{
  label: string
  type: 'email' | 'password' | 'text'
  autocomplete: string
  hint?: string
  error?: string
}>()

const value = defineModel<string>({ required: true })

// Further attributes, such as autocapitalize, belong on the input, not on the wrapper.
defineOptions({ inheritAttrs: false })

const id = useId()
const input = useTemplateRef<HTMLInputElement>('input')

const describedBy = computed(() => {
  const ids = [props.hint && `${id}-hint`, props.error && `${id}-error`].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
})

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="flex flex-col gap-1">
    <label
      :for="id"
      class="text-sm font-strong"
    >{{ props.label }}</label>
    <input
      v-bind="$attrs"
      :id="id"
      ref="input"
      v-model="value"
      :type="props.type"
      :autocomplete="props.autocomplete"
      :aria-invalid="props.error ? 'true' : undefined"
      :aria-describedby="describedBy"
      class="min-h-touch w-full rounded-md border border-field bg-surface px-3 text-base text-ink aria-invalid:border-2 aria-invalid:border-danger"
    >
    <p
      v-if="props.hint"
      :id="`${id}-hint`"
      class="text-sm text-muted"
    >
      {{ props.hint }}
    </p>
    <p
      v-if="props.error"
      :id="`${id}-error`"
      class="text-sm text-danger"
    >
      {{ props.error }}
    </p>
  </div>
</template>

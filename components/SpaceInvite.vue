<script setup lang="ts">
// While waiting for the second person: the invite code, or a button to get one.
const props = defineProps<{
  invite: string | null
}>()

const { t } = useI18n()
const { renewInvite } = useSpace()

const copyResult = ref<'copied' | 'failed'>()
const pending = ref(false)

// "Copied" must not stay next to a different code.
watch(() => props.invite, () => {
  copyResult.value = undefined
})

async function copy() {
  try {
    // Missing on pages without HTTPS (except localhost), which also ends up in "catch".
    await navigator.clipboard.writeText(props.invite!)
    copyResult.value = 'copied'
  }
  catch {
    copyResult.value = 'failed'
  }
}

async function newCode() {
  if (pending.value) {
    return
  }
  pending.value = true
  await renewInvite()
  pending.value = false
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <h2 class="text-xl">{{ t('space.invite.title') }}</h2>

    <template v-if="props.invite">
      <p class="text-muted">{{ t('space.invite.explanation') }}</p>
      <p class="text-sm font-strong">{{ t('space.invite.codeLabel') }}</p>
      <!-- "select-all": one tap selects the whole code for copying by hand. -->
      <p class="rounded-md border border-field bg-surface p-3 text-lg break-all select-all">{{ props.invite }}</p>
      <button
        type="button"
        class="min-h-touch rounded-md bg-accent px-4 font-strong text-on-accent"
        @click="copy"
      >
        {{ t('space.invite.copy') }}
      </button>
      <p
        role="status"
        class="text-sm"
      >
        {{ copyResult === 'copied' ? t('space.invite.copied') : '' }}
        {{ copyResult === 'failed' ? t('space.invite.copyFailed') : '' }}
      </p>
      <button
        type="button"
        :disabled="pending"
        class="min-h-touch rounded-md border border-field bg-surface px-4 font-strong disabled:cursor-wait disabled:faded"
        @click="newCode"
      >
        {{ t('space.invite.renew') }}
      </button>
      <p class="text-sm text-muted">{{ t('space.invite.renewHint') }}</p>
    </template>

    <template v-else>
      <p class="text-muted">{{ t('space.invite.noCode') }}</p>
      <button
        type="button"
        :disabled="pending"
        class="min-h-touch rounded-md bg-accent px-4 font-strong text-on-accent disabled:cursor-wait disabled:faded"
        @click="newCode"
      >
        {{ t('space.invite.create') }}
      </button>
    </template>

    <p class="text-sm text-muted">{{ t('space.invite.gotCode') }}</p>
  </section>
</template>

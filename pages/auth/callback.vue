<script setup lang="ts">
// Google sign-in and confirmation emails come back to this page. Supabase reads the
// code in the address on its own; this page waits for the result.
const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const session = useSessionStore()

definePageMeta({ access: 'public' })
// One address for all languages, because Supabase only returns to listed addresses.
defineI18nRoute(false)
useHead({ title: () => t('pages.callback.title') })

// Message key of what went wrong. Empty while the sign-in is still being checked.
const problem = ref<string>()

// Supabase reports a refused sign-in in the query or after the "#".
function wasRejected() {
  return Boolean(route.query.error) || new URLSearchParams(route.hash.slice(1)).has('error')
}

onMounted(async () => {
  if (wasRejected()) {
    problem.value = 'auth.callback.rejected'
    return
  }
  await session.init()
  if (session.isSignedIn) {
    // "replace" keeps the used code out of the browser history.
    await navigateTo(localePath('/dashboard'), { replace: true })
    return
  }
  problem.value = 'auth.callback.incomplete'
})
</script>

<template>
  <section>
    <h1 class="text-2xl">{{ t('pages.callback.title') }}</h1>
    <div
      v-if="problem"
      class="mt-4 flex max-w-form flex-col gap-4"
    >
      <p
        role="alert"
        class="rounded-md border-2 border-danger bg-surface p-4 text-danger"
      >
        {{ t(problem) }}
      </p>
      <NuxtLinkLocale
        to="/login"
        class="inline-flex min-h-touch items-center text-accent underline"
      >
        {{ t('auth.callback.toLogin') }}
      </NuxtLinkLocale>
    </div>
    <p
      v-else
      role="status"
      class="mt-4 text-muted"
    >
      {{ t('auth.callback.working') }}
    </p>
  </section>
</template>

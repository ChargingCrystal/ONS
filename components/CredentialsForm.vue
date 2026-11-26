<script setup lang="ts">
// Email and password form plus the Google button, used by the login and register pages.
const props = defineProps<{
  mode: 'login' | 'register'
}>()

const { t } = useI18n()
const session = useSessionStore()
const route = useRoute()
const returnTarget = useReturnTarget()

const email = ref('')
const password = ref('')
// Message keys, so the texts follow a language change.
const errors = reactive<{ email?: string, password?: string }>({})
const failure = ref<string>()
const confirmationSentTo = ref<string>()
const pending = ref(false)

const emailField = useTemplateRef('emailField')
const passwordField = useTemplateRef('passwordField')

const isRegistration = computed(() => props.mode === 'register')

function translate(key: string | undefined) {
  return key ? t(key, { min: PASSWORD_MIN_LENGTH }) : undefined
}

function validate() {
  errors.email = emailError(email.value)
  errors.password = isRegistration.value ? newPasswordError(password.value) : passwordError(password.value)
  return !errors.email && !errors.password
}

// Runs one request: blocks further clicks and turns failures into a message.
async function attempt(request: () => Promise<void>) {
  if (pending.value) {
    return
  }
  pending.value = true
  failure.value = undefined
  try {
    await request()
  }
  catch (error) {
    failure.value = authErrorKey(error instanceof AuthFailure ? error.code : undefined)
  }
  finally {
    pending.value = false
  }
}

function openRequestedPage() {
  return navigateTo(returnTarget(route.query.redirect))
}

async function submit() {
  if (!validate()) {
    // Move focus to the first field that needs attention, once it is marked as invalid.
    await nextTick()
    const firstInvalid = errors.email ? emailField.value : passwordField.value
    firstInvalid?.focus()
    return
  }
  const address = email.value.trim()

  await attempt(async () => {
    if (!isRegistration.value) {
      await session.signIn(address, password.value)
      await openRequestedPage()
      return
    }
    if (await session.register(address, password.value) === 'confirmationRequired') {
      confirmationSentTo.value = address
      return
    }
    await openRequestedPage()
  })
}

function continueWithGoogle() {
  // Supabase now leaves the app for Google and comes back to /auth/callback.
  return attempt(() => session.signInWithGoogle())
}
</script>

<template>
  <div class="mt-4 flex max-w-form flex-col gap-4">
    <p
      v-if="confirmationSentTo"
      role="status"
      class="rounded-md border border-field bg-surface p-4"
    >
      {{ t('auth.confirmationSent', { email: confirmationSentTo }) }}
    </p>

    <template v-else>
      <p
        v-if="failure"
        role="alert"
        class="rounded-md border-2 border-danger bg-surface p-4 text-danger"
      >
        {{ t(failure) }}
      </p>

      <!-- novalidate: the app shows its own messages, in the chosen language. -->
      <form
        class="flex flex-col gap-4"
        method="post"
        novalidate
        @submit.prevent="submit"
      >
        <FormField
          ref="emailField"
          v-model="email"
          type="email"
          autocomplete="email"
          :label="t('auth.email')"
          :error="translate(errors.email)"
        />
        <FormField
          ref="passwordField"
          v-model="password"
          type="password"
          :autocomplete="isRegistration ? 'new-password' : 'current-password'"
          :label="t('auth.password')"
          :hint="isRegistration ? t('auth.passwordHint', { min: PASSWORD_MIN_LENGTH }) : undefined"
          :error="translate(errors.password)"
        />
        <button
          type="submit"
          :disabled="pending"
          class="min-h-touch rounded-md bg-accent px-4 font-strong text-on-accent disabled:cursor-wait disabled:faded"
        >
          {{ isRegistration ? t('auth.createAccount') : t('auth.signIn') }}
        </button>
      </form>

      <button
        type="button"
        :disabled="pending"
        class="min-h-touch rounded-md border border-field bg-surface px-4 font-strong disabled:cursor-wait disabled:faded"
        @click="continueWithGoogle"
      >
        {{ t('auth.google') }}
      </button>
    </template>

    <!-- The other form, keeping the return address. -->
    <NuxtLinkLocale
      :to="{ path: isRegistration ? '/login' : '/register', query: route.query }"
      class="inline-flex min-h-touch items-center text-accent underline"
    >
      {{ isRegistration ? t('auth.haveAccount') : t('auth.noAccount') }}
    </NuxtLinkLocale>
  </div>
</template>

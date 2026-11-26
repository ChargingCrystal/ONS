<script setup lang="ts">
// Sign-in link or sign-out button in the header. Empty until the session is known,
// so the server-rendered landing page and the browser start out the same.
const { t } = useI18n()
const session = useSessionStore()
</script>

<template>
  <div class="flex min-h-touch items-center">
    <NuxtLinkLocale
      v-if="session.status === 'signedOut'"
      to="/login"
      class="inline-flex min-h-touch items-center px-2 text-sm font-strong text-accent underline"
    >
      {{ t('auth.signIn') }}
    </NuxtLinkLocale>
    <button
      v-else-if="session.isSignedIn"
      type="button"
      class="min-h-touch rounded-md border border-field px-3 text-sm font-strong"
      @click="session.signOut()"
    >
      {{ t('auth.signOut') }}
    </button>
  </div>
</template>

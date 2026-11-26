import type { SupabaseClient } from '@supabase/supabase-js'

// This file is the one place that reaches Supabase Auth.

// The client comes from plugins/auth.client.ts, so it exists only in the browser
// and only when the app is configured.
export function useSupabaseAuth(): SupabaseClient['auth'] | undefined {
  const supabase = useNuxtApp().$supabase as SupabaseClient | undefined
  return supabase?.auth
}

// Asks whether a sign-in provider is switched on. supabase-js has no call for this, and
// without the check a switched-off provider leaves the browser on a page with a raw error.
export function useProviderCheck() {
  const { supabaseUrl, supabaseKey } = useRuntimeConfig().public

  return async function isProviderEnabled(provider: 'google') {
    const settings = await $fetch<{ external?: Record<string, boolean> }>(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseKey },
    })
    return settings.external?.[provider] === true
  }
}

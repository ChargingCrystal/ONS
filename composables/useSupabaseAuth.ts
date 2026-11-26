import type { SupabaseClient } from '@supabase/supabase-js'

// The one place that reaches Supabase Auth. The client comes from plugins/auth.client.ts,
// so it exists only in the browser and only when the app is configured.
export function useSupabaseAuth(): SupabaseClient['auth'] | undefined {
  const supabase = useNuxtApp().$supabase as SupabaseClient | undefined
  return supabase?.auth
}

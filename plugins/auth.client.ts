import { createClient } from '@supabase/supabase-js'

export default defineNuxtPlugin(() => {
  const { supabaseUrl, supabaseKey } = useRuntimeConfig().public
  if (!supabaseUrl || !supabaseKey) return
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { flowType: 'pkce' } })
  return { provide: { supabase } }
})

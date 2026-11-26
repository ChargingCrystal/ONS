import { createClient } from '@supabase/supabase-js'
import { getHeader, type H3Event } from 'h3'
import { toApiError } from './api-error'

export function client(event: H3Event) {
  const { supabaseUrl, supabaseKey } = useRuntimeConfig(event).public
  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase runtime configuration is missing')
    throw toApiError('internal', 503)
  }
  const authorization = getHeader(event, 'authorization')
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) {
    throw toApiError('unauthorized')
  }
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } }
  })
}

type SupabaseResult<T> = {
  data: T
  error: { code?: string; message: string; status?: number; statusCode?: string } | null
  status?: number
}

export function result<T>(response: SupabaseResult<T>, operation?: 'createSpace' | 'joinSpace' | 'mutateDate') {
  if (!response.error) {
    return response.data
  }

  const { code, status, statusCode } = response.error
  if (response.status === 401 || status === 401 || statusCode === '401') {
    throw toApiError('unauthorized')
  }
  if (operation === 'joinSpace' && code === '22023') {
    throw toApiError('invite_invalid')
  }
  if ((operation === 'joinSpace' || operation === 'createSpace') && code === '23505') {
    throw toApiError('already_paired')
  }
  if (operation === 'mutateDate' && code === 'PGRST116') {
    throw toApiError('not_found')
  }

  console.error('Unexpected Supabase request failure', response.error)
  throw toApiError('internal', response.status === 503 || status === 503 || statusCode === '503' ? 503 : 500)
}

export async function room(db: ReturnType<typeof client>) {
  const id = result(await db.rpc('my_space'))
  if (!id) {
    throw toApiError('no_space')
  }
  return String(id)
}

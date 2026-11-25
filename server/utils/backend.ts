import { createClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { z } from 'zod'

export function client(event: H3Event) {
  const { supabaseUrl, supabaseKey } = useRuntimeConfig(event).public
  if (!supabaseUrl || !supabaseKey) throw createError({ statusCode: 503, statusMessage: 'Configure Supabase first' })
  const authorization = getHeader(event, 'authorization')
  if (!authorization?.startsWith('Bearer ')) throw createError({ statusCode: 401 })
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } }
  })
}

export function result<T>(response: { data: T, error: { code?: string, message: string } | null, status?: number }) {
  if (response.error) {
    const { code } = response.error
    const statusCode = code === '23505' ? 409 : code === '22023' ? 400 : code === 'PGRST116' ? 404 : response.status || 500
    throw createError({ statusCode, statusMessage: statusCode === 409 ? 'Already paired' : 'Request failed' })
  }
  return response.data
}

export async function room(db: ReturnType<typeof client>) {
  const id = result(await db.rpc('my_space'))
  if (!id) throw createError({ statusCode: 403, statusMessage: 'Join or create a space first' })
  return String(id)
}

export const dateFields = z.strictObject({
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(60),
  status: z.enum(['planned','done']).optional(),
  meeting_at: z.iso.datetime({ offset: true }).nullable().optional()
})

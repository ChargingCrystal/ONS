import { z } from 'zod'
export default defineEventHandler(async event => {
  const q = await getValidatedQuery(event, z.object({
    q: z.string().max(160).optional(), category: z.string().optional(),
    status: z.enum(['planned','done']).optional(),
    sort: z.enum(['title','meeting_at','created_at']).default('created_at'),
    order: z.enum(['asc','desc']).default('desc'),
    offset: z.coerce.number().int().nonnegative().default(0)
  }).parse)
  let query = client(event).from('dates').select()
  if (q.q) query = query.ilike('title', '%' + q.q.replace(/[\\%_]/g, '\\$&') + '%')
  if (q.category) query = query.eq('category', q.category)
  if (q.status) query = query.eq('status', q.status)
  return result(await query.order(q.sort, { ascending: q.order === 'asc' }).order('id').range(q.offset,q.offset+49))
})

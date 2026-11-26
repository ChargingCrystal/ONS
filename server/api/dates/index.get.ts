import { datesQuerySchema } from '../../../shared/api-contract'
import { defineApiHandler } from '../../utils/api-error'

export default defineApiHandler(async event => {
  const q = await getValidatedQuery(event, datesQuerySchema.parse)
  let query = client(event).from('dates').select()
  if (q.q) query = query.ilike('title', '%' + q.q.replace(/[\\%_]/g, '\\$&') + '%')
  if (q.category) query = query.eq('category', q.category)
  if (q.status) query = query.eq('status', q.status)
  return result(await query.order(q.sort, { ascending: q.order === 'asc' }).order('id').range(q.offset,q.offset+49))
})

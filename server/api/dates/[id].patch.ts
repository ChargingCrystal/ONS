import { defineApiHandler } from '../../utils/api-error'
import { dateParamsSchema, updateDateRequestSchema } from '../../../shared/api-contract'

export default defineApiHandler(async event => {
  const { id } = await getValidatedRouterParams(event, dateParamsSchema.parse)
  const body = await readValidatedBody(event, updateDateRequestSchema.parse)
  return result(await client(event).from('dates').update(body).eq('id', id).select().single(), 'mutateDate')
})

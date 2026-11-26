import { defineApiHandler } from '../../utils/api-error'
import { dateParamsSchema } from '../../../shared/api-contract'

export default defineApiHandler(async event => {
  const { id } = await getValidatedRouterParams(event, dateParamsSchema.parse)
  result(await client(event).from('dates').delete().eq('id', id).select('id').single(), 'mutateDate')
  return sendNoContent(event)
})

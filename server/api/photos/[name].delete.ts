import { defineApiHandler } from '../../utils/api-error'
import { photoParamsSchema } from '../../../shared/api-contract'

export default defineApiHandler(async event => {
  const { name } = await getValidatedRouterParams(event, photoParamsSchema.parse)
  const db = client(event)
  const space = await room(db)
  result(await db.storage.from('gallery').remove([space + '/' + name]))
  return sendNoContent(event)
})

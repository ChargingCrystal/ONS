import { defineApiHandler, toApiError } from '../../utils/api-error'
import { photoParamsSchema } from '../../../shared/api-contract'

export default defineApiHandler(async event => {
  const { name } = await getValidatedRouterParams(event, photoParamsSchema.parse)
  const db = client(event)
  const space = await room(db)
  const photo = result(await db.from('photos').select('path').eq('space_id', space).eq('id', name).maybeSingle())
  if (!photo) throw toApiError('not_found')
  result(await db.storage.from('gallery').remove([photo.path]))
  result(await db.rpc('forget_photo', { photo_id: name }), 'photo')
  return sendNoContent(event)
})

import { photoUploadMaxBytes, photoUploadUrlRequestSchema } from '../../../shared/api-contract'
import { defineApiHandler, toApiError } from '../../utils/api-error'

export default defineApiHandler(async event => {
  const body = await readBody(event)
  const parsed = photoUploadUrlRequestSchema.safeParse(body)
  if (!parsed.success) {
    if (parsed.error.issues.some(issue => issue.path[0] === 'mime')) {
      throw toApiError('validation_failed', 415)
    }
    if (typeof body?.size === 'number' && body.size > photoUploadMaxBytes) {
      throw toApiError('validation_failed', 413)
    }
    throw toApiError('validation_failed')
  }
  const db = client(event)
  const reservation = result(await db.rpc('reserve_photo_upload', {
    upload_mime: parsed.data.mime,
    upload_size: parsed.data.size,
  }), 'photo')
  const { signedUrl, token } = result(await db.storage.from('gallery')
    .createSignedUploadUrl(reservation.path, { upsert: false }))
  return { ...reservation, signedUrl, token }
})

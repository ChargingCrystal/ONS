import { confirmPhotoRequestSchema } from '../../../shared/api-contract'
import { defineApiHandler } from '../../utils/api-error'

export default defineApiHandler(async event => {
  const { uploadId } = await readValidatedBody(event, confirmPhotoRequestSchema.parse)
  return result(await client(event).rpc('confirm_photo', { photo_upload_id: uploadId }), 'photo')
})

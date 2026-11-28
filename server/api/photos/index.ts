import { isMethod, setResponseHeader } from 'h3'
import { photosQuerySchema } from '../../../shared/api-contract'
import { defineApiHandler, toApiError } from '../../utils/api-error'

export default defineApiHandler(async event => {
  if (!isMethod(event, 'GET', true)) {
    setResponseHeader(event, 'Allow', 'GET, HEAD')
    throw toApiError('validation_failed', 405)
  }
  const db = client(event)
  const space = await room(db)
  const { offset } = await getValidatedQuery(event, photosQuerySchema.parse)
  const photos = result(await db.from('photos').select('id,path,mime,size,uploaded_by,created_at')
    .eq('space_id', space).order('created_at', { ascending: false }).order('id').range(offset, offset + 29)) ?? []
  if (!photos.length) return []
  const urls = result(await db.storage.from('gallery').createSignedUrls(photos.map(photo => photo.path), 300)) ?? []
  const urlsByPath = new Map(urls.map(url => [url.path, url.signedUrl]))
  return photos.map(photo => ({
    name: photo.id,
    createdAt: photo.created_at,
    url: urlsByPath.get(photo.path) ?? null,
    mime: photo.mime,
    size: photo.size,
    uploadedBy: photo.uploaded_by,
  }))
})

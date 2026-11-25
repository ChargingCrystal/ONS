import { z } from 'zod'
export default defineEventHandler(async event => {
  const db = client(event)
  const space = await room(db)
  const { offset } = await getValidatedQuery(event,z.object({offset:z.coerce.number().int().nonnegative().default(0)}).parse)
  const gallery = db.storage.from('gallery')
  const files = result(await gallery.list(space,{offset,limit:30,sortBy:{column:'created_at',order:'desc'}})) ?? []
  if (!files.length) return []
  const urls = result(await gallery.createSignedUrls(files.map(f => space + '/' + f.name),300)) ?? []
  return files.map((f,i) => ({name:f.name,createdAt:f.created_at,url:urls[i]?.signedUrl}))
})

import { randomUUID } from 'node:crypto'
export default defineEventHandler(async event => {
  const db = client(event)
  const space = await room(db)
  const mime = getHeader(event,'content-type')
  if (!['image/jpeg','image/png','image/webp'].includes(mime ?? '')) throw createError({statusCode:415})
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of event.node.req) {
    const bytes = Buffer.from(chunk)
    length += bytes.length
    if (length > 5 * 1024 * 1024) throw createError({statusCode:413})
    chunks.push(bytes)
  }
  const bytes = Buffer.concat(chunks)
  const valid = mime === 'image/jpeg' ? bytes.subarray(0,3).equals(Buffer.from([255,216,255]))
    : mime === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))
    : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP'
  if (!valid) throw createError({statusCode:415})
  const path = space + '/' + randomUUID()
  return result(await db.storage.from('gallery').upload(path,bytes,{contentType:mime}))
})

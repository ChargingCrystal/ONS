import { z } from 'zod'
export default defineEventHandler(async event => {
  const { name } = await getValidatedRouterParams(event,z.object({name:z.uuid()}).parse)
  const db = client(event)
  const space = await room(db)
  result(await db.storage.from('gallery').remove([space + '/' + name]))
  return sendNoContent(event)
})

import { z } from 'zod'
export default defineEventHandler(async event => {
  const body = await readValidatedBody(event, z.strictObject({ code: z.string().regex(/^[a-f0-9]{32}$/) }).parse)
  return { id: result(await client(event).rpc('join_space', body)) }
})

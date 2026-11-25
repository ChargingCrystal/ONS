import { z } from 'zod'
export default defineEventHandler(async event => {
  const coords = await readValidatedBody(event, z.strictObject({
    lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180)
  }).parse)
  return result(await client(event).from('locations').upsert(coords, { onConflict: 'user_id' }).select().single())
})

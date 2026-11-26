import { defineApiHandler } from '../utils/api-error'
import { updateLocationRequestSchema } from '../../shared/api-contract'

export default defineApiHandler(async event => {
  const coords = await readValidatedBody(event, updateLocationRequestSchema.parse)
  const db = client(event)
  await room(db)
  return result(await db.from('locations').upsert(coords, { onConflict: 'user_id' }).select().single())
})

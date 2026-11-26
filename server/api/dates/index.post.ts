import { defineApiHandler } from '../../utils/api-error'
import { createDateRequestSchema } from '../../../shared/api-contract'

export default defineApiHandler(async event => {
  const body = await readValidatedBody(event, createDateRequestSchema.parse)
  const db = client(event)
  await room(db)
  return result(await db.from('dates').insert(body).select().single())
})

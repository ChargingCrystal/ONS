import { defineApiHandler } from '../../utils/api-error'
import { joinSpaceRequestSchema } from '../../../shared/api-contract'

export default defineApiHandler(async event => {
  const body = await readValidatedBody(event, joinSpaceRequestSchema.parse)
  return { id: result(await client(event).rpc('join_space', body), 'joinSpace') }
})

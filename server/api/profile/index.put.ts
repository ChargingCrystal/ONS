import { updateProfileRequestSchema } from '../../../shared/api-contract'
import { defineApiHandler } from '../../utils/api-error'

export default defineApiHandler(async event => {
  const profile = await readValidatedBody(event, updateProfileRequestSchema.parse)
  return result(await client(event).from('profiles')
    .upsert(profile, { onConflict: 'user_id' })
    .select('display_name')
    .single())
})

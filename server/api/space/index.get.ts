import { defineApiHandler } from '../../utils/api-error'

export default defineApiHandler(async event => result(await client(event).from('spaces').select('id,invite,members(user_id,slot)').maybeSingle()))

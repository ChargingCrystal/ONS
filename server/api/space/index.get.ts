export default defineEventHandler(async event => result(await client(event).from('spaces').select('id,invite,members(user_id,slot)').maybeSingle()))

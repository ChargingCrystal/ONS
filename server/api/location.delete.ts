import { defineApiHandler } from '../utils/api-error'

export default defineApiHandler(async event => {
  result(await client(event).rpc('delete_my_location'))
  return sendNoContent(event)
})

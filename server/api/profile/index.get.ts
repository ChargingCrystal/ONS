import { defineApiHandler } from '../../utils/api-error'

export default defineApiHandler(async event => result(await client(event).rpc('my_profile')))

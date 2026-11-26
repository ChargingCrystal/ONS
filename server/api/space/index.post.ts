import { defineApiHandler } from '../../utils/api-error'

export default defineApiHandler(async event => ({ id: result(await client(event).rpc('create_space'), 'createSpace') }))

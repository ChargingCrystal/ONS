export default defineEventHandler(async event => ({ id: result(await client(event).rpc('create_space')) }))

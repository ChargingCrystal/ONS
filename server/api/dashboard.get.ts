export default defineEventHandler(async event => result(await client(event).rpc('dashboard')))

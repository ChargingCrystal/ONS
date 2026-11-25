export default defineEventHandler(async event => {
  const body = await readValidatedBody(event, dateFields.parse)
  return result(await client(event).from('dates').insert(body).select().single())
})

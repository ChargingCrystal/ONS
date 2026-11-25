export default defineEventHandler(async event => {
  const body = await readValidatedBody(event, dateFields.partial().refine(v => Object.keys(v).length > 0).parse)
  return result(await client(event).from('dates').update(body).eq('id',getRouterParam(event,'id')).select().single())
})

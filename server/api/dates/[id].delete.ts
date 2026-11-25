export default defineEventHandler(async event => {
  result(await client(event).from('dates').delete().eq('id',getRouterParam(event,'id')).select('id').single())
  return sendNoContent(event)
})

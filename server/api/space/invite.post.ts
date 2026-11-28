import { defineApiHandler } from '../../utils/api-error'

export default defineApiHandler(async event => ({
  invite: result(await client(event).rpc('regenerate_invite'), 'regenerateInvite'),
}))

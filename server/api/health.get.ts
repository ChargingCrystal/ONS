import { setResponseHeader } from 'h3'
import type { HealthResponse } from '../../shared/api-contract'
import { defineApiHandler, toApiError } from '../utils/api-error'
import { client, result } from '../utils/backend'

export default defineApiHandler(async (event): Promise<HealthResponse> => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  let healthy: unknown
  try {
    const db = client(event, 'anonymous')
    const probe = await db.rpc('database_health').abortSignal(AbortSignal.timeout(3_000))
    healthy = result(probe)
  } catch {
    throw toApiError('internal', 503)
  }

  if (healthy !== true) {
    throw toApiError('internal', 503)
  }

  return { status: 'ok' }
})

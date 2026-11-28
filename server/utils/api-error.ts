import { createError, defineEventHandler, isError, type EventHandler, type EventHandlerRequest } from 'h3'
import { apiErrorCodeSchema, type ApiErrorCode } from '../../shared/api-errors'

const errorDetails = {
  invite_invalid: { statusCode: 400, statusMessage: 'Invalid or used invitation' },
  already_paired: { statusCode: 409, statusMessage: 'Already paired' },
  no_space: { statusCode: 403, statusMessage: 'Join or create a space first' },
  not_found: { statusCode: 404, statusMessage: 'Not found' },
  quota_exceeded: { statusCode: 409, statusMessage: 'Photo quota exceeded' },
  validation_failed: { statusCode: 400, statusMessage: 'Validation failed' },
  unauthorized: { statusCode: 401, statusMessage: 'Unauthorized' },
  internal: { statusCode: 500, statusMessage: 'Internal server error' },
} satisfies Record<ApiErrorCode, { statusCode: number; statusMessage: string }>

export function toApiError(code: ApiErrorCode, statusCode = errorDetails[code].statusCode) {
  return createError({ ...errorDetails[code], statusCode, data: { code } })
}

export function defineApiHandler<Response>(handler: EventHandler<EventHandlerRequest, Response>) {
  return defineEventHandler(async event => {
    try {
      return await handler(event)
    } catch (error) {
      if (isError(error)) {
        if (apiErrorCodeSchema.safeParse(error.data?.code).success) {
          throw error
        }
        if (error.statusCode === 400 || error.statusCode === 413 || error.statusCode === 415) {
          throw toApiError('validation_failed', error.statusCode)
        }
      }
      console.error('Unexpected API handler failure', error)
      throw toApiError('internal')
    }
  })
}

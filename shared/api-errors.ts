import { z } from 'zod'

export const apiErrorCodeSchema = z.enum([
  'invite_invalid',
  'already_paired',
  'no_space',
  'not_found',
  'validation_failed',
  'unauthorized',
  'internal',
])

export const apiErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  data: z.object({ code: apiErrorCodeSchema }),
})

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>

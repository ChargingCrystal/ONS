import { z } from 'zod'
import { DATE_CATEGORIES } from './date-categories'

const uuid = z.uuid()
const timestamp = z.iso.datetime({ offset: true })
const invite = z.string().regex(/^[a-f0-9]{32}$/)
const dateStatus = z.enum(['planned', 'done'])
export const dateCategorySchema = z.enum(DATE_CATEGORIES)
const offset = z.coerce.number().int().nonnegative().default(0)
const coordinates = {
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
}

export const joinSpaceRequestSchema = z.strictObject({ code: invite })
export const createDateRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  category: dateCategorySchema,
  status: dateStatus.optional(),
  meeting_at: timestamp.nullable().optional(),
})
export const updateDateRequestSchema = createDateRequestSchema.partial().refine(value => Object.keys(value).length > 0)
export const dateParamsSchema = z.object({ id: uuid })
export const datesQuerySchema = z.object({
  q: z.string().max(160).optional(),
  category: dateCategorySchema.optional(),
  status: dateStatus.optional(),
  sort: z.enum(['title', 'meeting_at', 'created_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  offset,
})
export const updateLocationRequestSchema = z.strictObject(coordinates)
export const photosQuerySchema = z.object({ offset })
export const photoParamsSchema = z.object({ name: uuid })
export const photoContentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp'])
export const photoUploadMaxBytes = 5 * 1024 * 1024
export const photoSpaceQuotaBytes = 50 * 1024 * 1024
const photoSizeSchema = z.number().int().positive().max(photoUploadMaxBytes)
export const photoUploadUrlRequestSchema = z.strictObject({
  mime: photoContentTypeSchema,
  size: photoSizeSchema,
})
export const photoUploadUrlResponseSchema = z.object({
  uploadId: uuid,
  path: z.string(),
  signedUrl: z.url(),
  token: z.string().min(1),
})
export const confirmPhotoRequestSchema = z.strictObject({ uploadId: uuid })
export const photoResponseSchema = z.object({
  id: uuid,
  space_id: uuid,
  path: z.string(),
  mime: photoContentTypeSchema,
  size: photoSizeSchema,
  uploaded_by: uuid.nullable(),
  created_at: timestamp,
})

export const healthResponseSchema = z.object({ status: z.literal('ok') })
const displayName = z.string().trim().min(1).max(60)
export const updateProfileRequestSchema = z.strictObject({ display_name: displayName })
export const profileResponseSchema = z.object({ display_name: displayName.nullable() })
export const inviteResponseSchema = z.object({ invite })
export const spaceIdResponseSchema = z.object({ id: uuid })
export const spaceResponseSchema = spaceIdResponseSchema.extend({
  invite: invite.nullable(),
  members: z.array(z.object({
    user_id: uuid,
    slot: z.union([z.literal(1), z.literal(2)]),
    display_name: displayName.nullable(),
  })),
})
export const noContentResponseSchema = z.literal('')
export const dateResponseSchema = z.object({
  id: uuid,
  space_id: uuid,
  title: z.string(),
  category: dateCategorySchema,
  status: dateStatus,
  meeting_at: timestamp.nullable(),
  created_at: timestamp,
})
export const datesResponseSchema = z.array(dateResponseSchema)
const partnerLocationSchema = z.object({ user_id: uuid, ...coordinates })
export const locationResponseSchema = z.object({
  partners: z.array(partnerLocationSchema),
  distanceKm: z.number().nullable(),
  midpoint: z.object(coordinates).nullable(),
})
export const savedLocationResponseSchema = partnerLocationSchema.extend({ space_id: uuid })
const monthTotalSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  total: z.number().int().nonnegative(),
})
export const dashboardResponseSchema = z.object({
  serverTime: timestamp,
  nextMeeting: dateResponseSchema.nullable(),
  categoriesByMonth: z.array(monthTotalSchema.extend({ category: dateCategorySchema })),
  datesByMonth: z.array(monthTotalSchema).length(12),
})
export const photosResponseSchema = z.array(z.object({
  name: uuid,
  createdAt: timestamp,
  url: z.url().nullish(),
  mime: photoContentTypeSchema,
  size: photoSizeSchema,
  uploadedBy: uuid.nullable(),
}))

export type JoinSpaceRequest = z.input<typeof joinSpaceRequestSchema>
export type CreateDateRequest = z.input<typeof createDateRequestSchema>
export type UpdateDateRequest = z.input<typeof updateDateRequestSchema>
export type DateParams = z.input<typeof dateParamsSchema>
export type DatesQuery = z.input<typeof datesQuerySchema>
export type UpdateLocationRequest = z.input<typeof updateLocationRequestSchema>
export type PhotosQuery = z.input<typeof photosQuerySchema>
export type PhotoParams = z.input<typeof photoParamsSchema>
export type PhotoContentType = z.infer<typeof photoContentTypeSchema>
export type PhotoUploadUrlRequest = z.input<typeof photoUploadUrlRequestSchema>
export type PhotoUploadUrlResponse = z.infer<typeof photoUploadUrlResponseSchema>
export type ConfirmPhotoRequest = z.input<typeof confirmPhotoRequestSchema>
export type PhotoResponse = z.infer<typeof photoResponseSchema>
export type HealthResponse = z.infer<typeof healthResponseSchema>
export type UpdateProfileRequest = z.input<typeof updateProfileRequestSchema>
export type ProfileResponse = z.infer<typeof profileResponseSchema>
export type InviteResponse = z.infer<typeof inviteResponseSchema>
export type SpaceIdResponse = z.infer<typeof spaceIdResponseSchema>
export type SpaceResponse = z.infer<typeof spaceResponseSchema>
export type NoContentResponse = z.infer<typeof noContentResponseSchema>
export type DateResponse = z.infer<typeof dateResponseSchema>
export type DatesResponse = z.infer<typeof datesResponseSchema>
export type LocationResponse = z.infer<typeof locationResponseSchema>
export type SavedLocationResponse = z.infer<typeof savedLocationResponseSchema>
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>
export type PhotosResponse = z.infer<typeof photosResponseSchema>

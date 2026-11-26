import { z } from 'zod'

const uuid = z.uuid()
const timestamp = z.iso.datetime({ offset: true })
const invite = z.string().regex(/^[a-f0-9]{32}$/)
const dateStatus = z.enum(['planned', 'done'])
const offset = z.coerce.number().int().nonnegative().default(0)
const coordinates = {
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
}

export const joinSpaceRequestSchema = z.strictObject({ code: invite })
export const createDateRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(60),
  status: dateStatus.optional(),
  meeting_at: timestamp.nullable().optional(),
})
export const updateDateRequestSchema = createDateRequestSchema.partial().refine(value => Object.keys(value).length > 0)
export const dateParamsSchema = z.object({ id: uuid })
export const datesQuerySchema = z.object({
  q: z.string().max(160).optional(),
  category: z.string().optional(),
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
export const uploadPhotoRequestSchema = z.object({
  contentType: photoContentTypeSchema,
  body: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength <= photoUploadMaxBytes),
})

export const healthResponseSchema = z.object({ status: z.literal('ok') })
export const spaceIdResponseSchema = z.object({ id: uuid })
export const spaceResponseSchema = spaceIdResponseSchema.extend({
  invite: invite.nullable(),
  members: z.array(z.object({ user_id: uuid, slot: z.union([z.literal(1), z.literal(2)]) })),
})
export const noContentResponseSchema = z.literal('')
export const dateResponseSchema = z.object({
  id: uuid,
  space_id: uuid,
  title: z.string(),
  category: z.string(),
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
export const dashboardResponseSchema = z.object({
  serverTime: timestamp,
  nextMeeting: dateResponseSchema.nullable(),
  categoriesByMonth: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    category: z.string(),
    total: z.number().int().nonnegative(),
  })),
})
export const photosResponseSchema = z.array(z.object({
  name: uuid,
  createdAt: timestamp,
  url: z.url().nullish(),
}))
export const uploadPhotoResponseSchema = z.object({ id: uuid, path: z.string(), fullPath: z.string() })

export type JoinSpaceRequest = z.input<typeof joinSpaceRequestSchema>
export type CreateDateRequest = z.input<typeof createDateRequestSchema>
export type UpdateDateRequest = z.input<typeof updateDateRequestSchema>
export type DateParams = z.input<typeof dateParamsSchema>
export type DatesQuery = z.input<typeof datesQuerySchema>
export type UpdateLocationRequest = z.input<typeof updateLocationRequestSchema>
export type PhotosQuery = z.input<typeof photosQuerySchema>
export type PhotoParams = z.input<typeof photoParamsSchema>
export type PhotoContentType = z.infer<typeof photoContentTypeSchema>
export type UploadPhotoRequest = z.input<typeof uploadPhotoRequestSchema>
export type HealthResponse = z.infer<typeof healthResponseSchema>
export type SpaceIdResponse = z.infer<typeof spaceIdResponseSchema>
export type SpaceResponse = z.infer<typeof spaceResponseSchema>
export type NoContentResponse = z.infer<typeof noContentResponseSchema>
export type DateResponse = z.infer<typeof dateResponseSchema>
export type DatesResponse = z.infer<typeof datesResponseSchema>
export type LocationResponse = z.infer<typeof locationResponseSchema>
export type SavedLocationResponse = z.infer<typeof savedLocationResponseSchema>
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>
export type PhotosResponse = z.infer<typeof photosResponseSchema>
export type UploadPhotoResponse = z.infer<typeof uploadPhotoResponseSchema>

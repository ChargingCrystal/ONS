export const DATE_CATEGORIES = [
  'dinner',
  'movie',
  'walk',
  'trip',
  'video_call',
  'game',
  'other',
] as const

export type DateCategory = typeof DATE_CATEGORIES[number]

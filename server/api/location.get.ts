import { defineApiHandler } from '../utils/api-error'
import { distanceAndMidpoint } from '../utils/geo'

export default defineApiHandler(async event => {
  const partners = result(await client(event).from('locations').select('user_id,lat,lon').order('user_id')) ?? []
  if (partners.length !== 2) return { partners, distanceKm: null, midpoint: null }
  return { partners, ...distanceAndMidpoint(partners[0], partners[1]) }
})

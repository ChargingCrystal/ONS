export default defineEventHandler(async event => {
  const partners = result(await client(event).from('locations').select('user_id,lat,lon').order('user_id')) ?? []
  if (partners.length !== 2) return { partners, distanceKm: null, midpoint: null }
  const rad = Math.PI / 180
  const [a,b] = partners.map(p => {
    const lat = p.lat * rad, lon = p.lon * rad
    return [Math.cos(lat)*Math.cos(lon), Math.cos(lat)*Math.sin(lon), Math.sin(lat)]
  })
  const sum = a.map((x,i) => x + b[i])
  const chord = Math.hypot(...a.map((x,i) => x - b[i]))
  const distanceKm = 6371.0088 * 2 * Math.asin(Math.min(1,chord / 2))
  const midpoint = Math.hypot(...sum) < 1e-10 ? null : {
    lat: Math.atan2(sum[2], Math.hypot(sum[0],sum[1])) / rad,
    lon: Math.atan2(sum[1],sum[0]) / rad
  }
  return { partners, distanceKm, midpoint }
})

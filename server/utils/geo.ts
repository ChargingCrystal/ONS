interface Coordinates {
  lat: number
  lon: number
}

const radiansPerDegree = Math.PI / 180
const earthRadiusKm = 6371.0088

function unitVector(point: Coordinates) {
  const lat = point.lat * radiansPerDegree
  const lon = point.lon * radiansPerDegree
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
}

export function distanceAndMidpoint(first: Coordinates, second: Coordinates) {
  const a = unitVector(first)
  const b = unitVector(second)
  const sum = a.map((value, index) => value + b[index])
  const chord = Math.hypot(...a.map((value, index) => value - b[index]))
  const distanceKm = earthRadiusKm * 2 * Math.asin(Math.min(1, chord / 2))

  // Antipodal points have no unique midpoint.
  const midpoint = Math.hypot(...sum) < 1e-10 ? null : {
    lat: Math.atan2(sum[2], Math.hypot(sum[0], sum[1])) / radiansPerDegree,
    lon: Math.atan2(sum[1], sum[0]) / radiansPerDegree,
  }
  return { distanceKm, midpoint }
}

// Address → coordinates via Nominatim (OpenStreetMap). Free, no key; the usage
// policy requires an identifying User-Agent and tolerates only light traffic —
// we geocode once per address save, never per request.

import type { GeoPoint } from "./geo"

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(address)}&format=json&limit=1`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ShiftPilot/1.0 (staff-sharing marketplace)" },
    })
    if (!res.ok) return null

    const results = (await res.json()) as Array<{ lat: string; lon: string }>
    const first = results[0]
    if (!first) return null

    const lat = Number(first.lat)
    const lng = Number(first.lon)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null

    return { lat, lng }
  } catch {
    return null
  }
}

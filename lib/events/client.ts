// Nearby same-day events via the Ticketmaster Discovery API, used to estimate
// footfall/traffic for a venue. Requires TICKETMASTER_API_KEY — degrades to an
// empty list (never throws) so a missing key doesn't break the dashboard,
// same spirit as lib/marketplace/geocode.ts.

const DISCOVERY_URL = "https://app.ticketmaster.com/discovery/v2/events.json"

export const EVENTS_RADIUS_KM = 5

export interface NearbyEvent {
  id: string
  name: string
  venueName: string | null
  localTime: string | null
  url: string
  segment: string | null
}

export async function getNearbyEventsToday(lat: number, lng: number): Promise<NearbyEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY
  if (!apiKey) return []

  const now = new Date()
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 0)

  const params = new URLSearchParams({
    apikey: apiKey,
    latlong: `${lat},${lng}`,
    radius: String(EVENTS_RADIUS_KM),
    unit: "km",
    startDateTime: startOfDay.toISOString().replace(/\.\d+Z$/, "Z"),
    endDateTime: endOfDay.toISOString().replace(/\.\d+Z$/, "Z"),
    sort: "date,asc",
    size: "20",
  })

  try {
    const res = await fetch(`${DISCOVERY_URL}?${params.toString()}`)
    if (!res.ok) return []

    const data = await res.json()
    const events = data._embedded?.events as
      | Array<{
          id: string
          name: string
          url: string
          dates?: { start?: { localTime?: string } }
          classifications?: Array<{ segment?: { name?: string } }>
          _embedded?: { venues?: Array<{ name?: string }> }
        }>
      | undefined
    if (!events) return []

    return events.map((e) => ({
      id: e.id,
      name: e.name,
      venueName: e._embedded?.venues?.[0]?.name ?? null,
      localTime: e.dates?.start?.localTime ?? null,
      url: e.url,
      segment: e.classifications?.[0]?.segment?.name ?? null,
    }))
  } catch {
    return []
  }
}

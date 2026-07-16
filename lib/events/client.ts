// Nearby same-day events via the Ticketmaster Discovery API, used to estimate
// footfall/traffic for a venue. Requires TICKETMASTER_API_KEY — degrades to
// DEMO_EVENTS (never throws) so a missing key doesn't break the dashboard,
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

// Real listings for Thursday 16 July 2026, all within the 5 km radius of
// Camondas (Zellescher Weg 41) — the Semperoper and WEINsommer entries were
// checked against the venues' own calendars, YETI Demo Day is our own.
//
// ⚠️  Two caveats, both deliberate:
//   1. HARDCODED TO ONE DATE. These were true on 16 Jul 2026 and are stale
//      after it — the dashboard would present last week's listings as today's.
//   2. DRESDEN-ONLY. Wrong for any other venue.
// Set a real TICKETMASTER_API_KEY before a customer sees this; the live API
// takes over the moment one exists.
//
// Ordered by start time to match the API's `sort: date,asc`. Three is also the
// count estimateTraffic() reads as "high".
const DEMO_EVENTS: NearbyEvent[] = [
  {
    id: "demo-weinsommer",
    name: "WEINsommer auf der Hauptstraße",
    venueName: "Hauptstraße",
    localTime: "16:00:00",
    url: "https://hauptsache-hauptstrasse.de/feste-events/aktuelle-events/",
    segment: "Miscellaneous",
  },
  {
    id: "demo-yeti",
    name: "YETI Demo Day",
    venueName: "HTW Dresden, S-Gebäude",
    localTime: "16:30:00",
    url: "https://www.htw-dresden.de/",
    segment: "Miscellaneous",
  },
  {
    id: "demo-semperoper",
    name: "Viva la Vida – A Tribute to Frida Kahlo",
    venueName: "Semperoper Dresden",
    localTime: "19:30:00",
    url: "https://www.semperoper.de/en/whats-on/calendar/calendar.html",
    segment: "Arts & Theatre",
  },
]

export async function getNearbyEventsToday(lat: number, lng: number): Promise<NearbyEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY
  if (!apiKey) return DEMO_EVENTS

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

// Cross-owner venue discovery. Pure filtering logic — the Prisma query that
// feeds it lives in queries.ts so this stays unit-testable.

import { haversineKm } from "./geo"

export interface VenueGeo {
  id: string
  ownerId: string
  lat: number | null
  lng: number | null
  isDiscoverable: boolean
  discoveryRadiusKm: number
}

export interface NearbyVenue<T extends VenueGeo> {
  venue: T
  distanceKm: number
}

export function filterNearbyVenues<T extends VenueGeo>(
  self: VenueGeo,
  candidates: T[]
): NearbyVenue<T>[] {
  if (self.lat == null || self.lng == null) return []
  const origin = { lat: self.lat, lng: self.lng }

  return candidates
    .filter((v) => v.isDiscoverable && v.ownerId !== self.ownerId)
    .flatMap((venue) => {
      if (venue.lat == null || venue.lng == null) return []
      const distanceKm = haversineKm(origin, { lat: venue.lat, lng: venue.lng })
      // Visibility is mutual: both venues' radii must cover the distance.
      if (distanceKm > Math.min(self.discoveryRadiusKm, venue.discoveryRadiusKm)) return []
      return [{ venue, distanceKm }]
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

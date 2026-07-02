// DB boundary for marketplace discovery. Deliberately relaxes ownerId scoping:
// this is the ONE place cross-owner Location reads are allowed, and only for
// venues that opted in via isDiscoverable.

import { prisma } from "@/prisma/client"
import { filterNearbyVenues, type VenueGeo } from "./discovery"

export interface NearbyVenueRow extends VenueGeo {
  name: string
}

export async function getNearbyVenues(self: VenueGeo) {
  // Mutual visibility: a venue that hasn't opted in doesn't get to browse either.
  if (!self.isDiscoverable || self.lat == null || self.lng == null) return []

  const candidates = await prisma.location.findMany({
    where: {
      isDiscoverable: true,
      ownerId: { not: self.ownerId },
      lat: { not: null },
      lng: { not: null },
    },
    select: {
      id: true,
      ownerId: true,
      name: true,
      lat: true,
      lng: true,
      isDiscoverable: true,
      discoveryRadiusKm: true,
    },
  })

  return filterNearbyVenues<NearbyVenueRow>(self, candidates)
}

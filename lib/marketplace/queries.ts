// DB boundary for marketplace discovery. Deliberately relaxes ownerId scoping:
// this is the ONE place cross-owner Location reads are allowed, and only for
// venues that opted in via isDiscoverable.

import { prisma } from "@/prisma/client"
import { filterNearbyVenues, type VenueGeo } from "./discovery"
import { anonymizeListing, type AnonymizedListingCard } from "./anonymize"

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

// OPEN, future-dated listings from venues in mutual range, anonymized before
// they leave this module — the page never sees counterparty identities.
export async function getDiscoveryFeed(self: VenueGeo): Promise<AnonymizedListingCard[]> {
  if (!self.isDiscoverable || self.lat == null || self.lng == null) return []

  const todayUtc = new Date()
  todayUtc.setUTCHours(0, 0, 0, 0)

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
      lat: true,
      lng: true,
      isDiscoverable: true,
      discoveryRadiusKm: true,
      sharingListings: {
        where: { status: "OPEN", date: { gte: todayUtc } },
        orderBy: { date: "asc" },
      },
    },
  })

  return filterNearbyVenues(self, candidates).flatMap(({ venue, distanceKm }) =>
    venue.sharingListings.map((listing) => anonymizeListing(listing, distanceKm))
  )
}

export interface DealRow {
  id: string
  status: "AWAITING_MANAGER" | "MANAGERS_AGREED" | "DECLINED"
  direction: "LENDING" | "BORROWING"
  role: string
  date: Date
  startTime: string
  endTime: string
  agreedRateCents: number | null
  counterpartyName: string
  /** The lent worker — exposed to the LENDER's manager only (anti-poaching). */
  employeeName: string | null
  /** Whether the acting venue posted the listing (and therefore holds the confirm). */
  isListingOwner: boolean
}

export async function getDealsForLocation(locationId: string): Promise<DealRow[]> {
  const deals = await prisma.sharingDeal.findMany({
    where: { OR: [{ lenderLocationId: locationId }, { borrowerLocationId: locationId }] },
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { role: true, date: true, startTime: true, endTime: true, locationId: true } },
      lenderLocation: { select: { name: true } },
      borrowerLocation: { select: { name: true } },
      employee: { select: { name: true } },
    },
  })

  return deals.map((deal) => {
    const isLender = deal.lenderLocationId === locationId
    return {
      id: deal.id,
      status: deal.status,
      direction: isLender ? "LENDING" : "BORROWING",
      role: deal.listing.role,
      date: deal.listing.date,
      startTime: deal.listing.startTime,
      endTime: deal.listing.endTime,
      agreedRateCents: deal.agreedRateCents,
      counterpartyName: isLender ? deal.borrowerLocation.name : deal.lenderLocation.name,
      employeeName: isLender ? deal.employee.name : null,
      isListingOwner: deal.listing.locationId === locationId,
    }
  })
}

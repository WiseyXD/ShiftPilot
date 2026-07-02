// Pre-deal anonymization (anti-poaching): counterparties see what the work is,
// never who or where it is. Built as an explicit whitelist — new fields on the
// listing DON'T reach the feed unless added here on purpose.

import type { ListingType } from "./listings"

export interface AnonymizedListingCard {
  id: string
  type: ListingType
  role: string
  date: Date
  startTime: string
  endTime: string
  hourlyRateCents: number | null
  distanceKm: number
}

interface FeedListing {
  id: string
  type: ListingType
  role: string
  date: Date
  startTime: string
  endTime: string
  hourlyRateCents: number | null
}

export function anonymizeListing(listing: FeedListing, distanceKm: number): AnonymizedListingCard {
  return {
    id: listing.id,
    type: listing.type,
    role: listing.role,
    date: listing.date,
    startTime: listing.startTime,
    endTime: listing.endTime,
    hourlyRateCents: listing.hourlyRateCents,
    distanceKm,
  }
}

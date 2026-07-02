import { describe, it, expect } from "vitest"
import { filterNearbyVenues, type VenueGeo } from "../discovery"

// Distances from centre: ~0 km, ~0.5 km, ~2.8 km, ~28 km (well outside any radius)
const CENTRE = { lat: 52.52, lng: 13.405 }

function venue(overrides: Partial<VenueGeo> & { id: string }): VenueGeo {
  return {
    ownerId: "owner-b",
    lat: CENTRE.lat,
    lng: CENTRE.lng,
    isDiscoverable: true,
    discoveryRadiusKm: 3,
    ...overrides,
  }
}

const SELF = venue({ id: "self", ownerId: "owner-a" })

describe("filterNearbyVenues", () => {
  it("returns discoverable venues in range with their distance, nearest first", () => {
    const near = venue({ id: "near", lat: 52.5245 }) // ~0.5 km
    const farther = venue({ id: "farther", lat: 52.545 }) // ~2.8 km
    const result = filterNearbyVenues(SELF, [farther, near])

    expect(result.map((r) => r.venue.id)).toEqual(["near", "farther"])
    expect(result[0].distanceKm).toBeGreaterThan(0.4)
    expect(result[0].distanceKm).toBeLessThan(0.6)
  })

  it("never returns venues that have not opted in", () => {
    const hidden = venue({ id: "hidden", isDiscoverable: false })
    expect(filterNearbyVenues(SELF, [hidden])).toEqual([])
  })

  it("respects the smaller of the two venues' radii (visibility is mutual)", () => {
    // ~2.8 km away. Self can see 3 km, but the candidate only shares within 2 km.
    const shy = venue({ id: "shy", lat: 52.545, discoveryRadiusKm: 2 })
    expect(filterNearbyVenues(SELF, [shy])).toEqual([])

    // Same distance, both radii cover it.
    const open = venue({ id: "open", lat: 52.545, discoveryRadiusKm: 5 })
    expect(filterNearbyVenues(SELF, [open]).map((r) => r.venue.id)).toEqual(["open"])

    // Self's own radius also caps the range, even if the candidate's is huge.
    const selfNarrow = venue({ id: "self", ownerId: "owner-a", discoveryRadiusKm: 1 })
    expect(filterNearbyVenues(selfNarrow, [open])).toEqual([])
  })

  it("excludes venues belonging to the same owner", () => {
    const sibling = venue({ id: "sibling", ownerId: "owner-a" })
    expect(filterNearbyVenues(SELF, [sibling])).toEqual([])
  })

  it("skips candidates without coordinates and returns nothing when self is un-geocoded", () => {
    const noCoords = venue({ id: "no-coords", lat: null, lng: null })
    expect(filterNearbyVenues(SELF, [noCoords])).toEqual([])

    const selfNoCoords = venue({ id: "self", ownerId: "owner-a", lat: null, lng: null })
    expect(filterNearbyVenues(selfNoCoords, [venue({ id: "near" })])).toEqual([])
  })
})

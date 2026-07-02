import { describe, it, expect } from "vitest"
import { anonymizeListing } from "../anonymize"

// A listing exactly as the feed query returns it — loaded with identifying
// data that must never reach the counterparty before a deal is accepted.
const rawListing = {
  id: "listing-1",
  type: "OFFER" as const,
  role: "Barista",
  date: new Date("2026-07-04T00:00:00Z"),
  startTime: "17:00",
  endTime: "22:00",
  hourlyRateCents: 1850,
  employee: { name: "Alice Schmidt", email: "alice@cafe-nero.de" },
  location: { name: "Café Nero — Hauptstraße", address: "Hauptstraße 12, 10827 Berlin" },
}

describe("anonymizeListing", () => {
  it("maps the listing to a public card with role, window, rate, and distance", () => {
    const card = anonymizeListing(rawListing, 1.234)

    expect(card).toEqual({
      id: "listing-1",
      type: "OFFER",
      role: "Barista",
      date: rawListing.date,
      startTime: "17:00",
      endTime: "22:00",
      hourlyRateCents: 1850,
      distanceKm: 1.234,
    })
  })

  it("cannot leak the employee's name/email or the venue's name/address", () => {
    const card = anonymizeListing(rawListing, 1.2)
    const serialized = JSON.stringify(card)

    expect(serialized).not.toContain("Alice")
    expect(serialized).not.toContain("alice@cafe-nero.de")
    expect(serialized).not.toContain("Nero")
    expect(serialized).not.toContain("Hauptstraße")
  })

  it("exposes exactly the whitelisted keys — nothing extra survives the mapping", () => {
    // Extra fields on the input (e.g. a future locationId join) must not pass through.
    const withExtras = {
      ...rawListing,
      locationId: "loc-secret",
      createdAt: new Date(),
    }
    const card = anonymizeListing(withExtras, 0.5)

    expect(Object.keys(card).sort()).toEqual([
      "date",
      "distanceKm",
      "endTime",
      "hourlyRateCents",
      "id",
      "role",
      "startTime",
      "type",
    ])
  })

  it("keeps a negotiable rate as null", () => {
    const card = anonymizeListing({ ...rawListing, hourlyRateCents: null }, 1.2)
    expect(card.hourlyRateCents).toBeNull()
  })
})

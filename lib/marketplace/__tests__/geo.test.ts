import { describe, it, expect } from "vitest"
import { haversineKm } from "../geo"

// Reference coordinates (city centres)
const BERLIN = { lat: 52.52, lng: 13.405 }
const POTSDAM = { lat: 52.3906, lng: 13.0645 }

describe("haversineKm", () => {
  it("returns the known distance between Berlin and Potsdam (~27 km)", () => {
    const d = haversineKm(BERLIN, POTSDAM)
    expect(d).toBeGreaterThan(26)
    expect(d).toBeLessThan(29)
  })

  it("is symmetric", () => {
    expect(haversineKm(BERLIN, POTSDAM)).toBeCloseTo(haversineKm(POTSDAM, BERLIN), 10)
  })

  it("returns 0 for identical points", () => {
    expect(haversineKm(BERLIN, BERLIN)).toBe(0)
  })

  it("resolves sub-kilometre distances for venues on nearby streets", () => {
    // Two points ~500 m apart in central Berlin
    const a = { lat: 52.52, lng: 13.405 }
    const b = { lat: 52.5245, lng: 13.405 }
    const d = haversineKm(a, b)
    expect(d).toBeGreaterThan(0.4)
    expect(d).toBeLessThan(0.6)
  })
})

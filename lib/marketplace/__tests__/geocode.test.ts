import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { geocodeAddress } from "../geocode"

// Nominatim is an external service — mocked at the fetch boundary.
const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const nominatimHit = { lat: "52.5200066", lon: "13.404954" }

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

describe("geocodeAddress", () => {
  it("resolves an address to lat/lng from the first Nominatim result", async () => {
    fetchMock.mockResolvedValue(jsonResponse([nominatimHit]))

    const result = await geocodeAddress("Alexanderplatz 1, Berlin")

    expect(result).toEqual({ lat: 52.5200066, lng: 13.404954 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("nominatim.openstreetmap.org/search")
    expect(String(url)).toContain(encodeURIComponent("Alexanderplatz 1, Berlin"))
    // Nominatim usage policy requires an identifying User-Agent
    expect(init?.headers?.["User-Agent"]).toBeTruthy()
  })

  it("returns null when the address matches nothing", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]))
    expect(await geocodeAddress("zzzz nowhere at all")).toBeNull()
  })

  it("returns null on a non-OK response instead of throwing", async () => {
    fetchMock.mockResolvedValue(jsonResponse("rate limited", false, 429))
    expect(await geocodeAddress("Alexanderplatz 1, Berlin")).toBeNull()
  })
})

import { describe, it, expect } from "vitest"
import { validateListingInput, formatRate } from "../listings"

const TODAY = new Date("2026-07-02T08:00:00Z")

const base = {
  type: "REQUEST" as const,
  role: "Barista",
  date: "2026-07-04",
  startTime: "17:00",
  endTime: "22:00",
  employeeId: null,
  hourlyRateCents: 1800,
}

describe("validateListingInput", () => {
  it("accepts a valid REQUEST without an employee", () => {
    const result = validateListingInput(base, TODAY)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.type).toBe("REQUEST")
      expect(result.value.date.toISOString()).toContain("2026-07-04")
    }
  })

  it("rejects an OFFER without an employee — offers lend a real person", () => {
    const result = validateListingInput({ ...base, type: "OFFER" }, TODAY)
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/employee/i) })
  })

  it("accepts an OFFER with an employee", () => {
    const result = validateListingInput({ ...base, type: "OFFER", employeeId: "emp-1" }, TODAY)
    expect(result.ok).toBe(true)
  })

  it("rejects a missing role and a past date", () => {
    expect(validateListingInput({ ...base, role: "  " }, TODAY).ok).toBe(false)
    expect(validateListingInput({ ...base, date: "2026-06-30" }, TODAY).ok).toBe(false)
  })

  it("rejects a window that ends before it starts", () => {
    const result = validateListingInput({ ...base, startTime: "22:00", endTime: "17:00" }, TODAY)
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/end/i) })
  })

  it("treats a blank rate as negotiable and rejects a non-positive one", () => {
    const negotiable = validateListingInput({ ...base, hourlyRateCents: null }, TODAY)
    expect(negotiable.ok).toBe(true)
    if (negotiable.ok) expect(negotiable.value.hourlyRateCents).toBeNull()

    expect(validateListingInput({ ...base, hourlyRateCents: 0 }, TODAY).ok).toBe(false)
    expect(validateListingInput({ ...base, hourlyRateCents: -100 }, TODAY).ok).toBe(false)
  })
})

describe("formatRate", () => {
  it("formats whole-euro and cent rates, and null as negotiable", () => {
    expect(formatRate(1800)).toBe("€18/h")
    expect(formatRate(1850)).toBe("€18.50/h")
    expect(formatRate(null)).toBe("Negotiable")
  })
})

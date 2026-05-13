import { describe, it, expect } from "vitest"
import { isInFreezeWindow } from "../freeze"

const config = { freezeWindowHours: 24 }
const shift = new Date("2025-01-10T12:00:00Z") // Friday noon

describe("isInFreezeWindow", () => {
  it("returns false when well outside the freeze window", () => {
    const now = new Date("2025-01-08T12:00:00Z") // 48hrs before
    expect(isInFreezeWindow(shift, config, now)).toBe(false)
  })

  it("returns true when inside the freeze window", () => {
    const now = new Date("2025-01-09T13:00:00Z") // 23hrs before
    expect(isInFreezeWindow(shift, config, now)).toBe(true)
  })

  it("returns false exactly at the freeze boundary (boundary is exclusive start)", () => {
    const now = new Date("2025-01-09T12:00:00Z") // exactly 24hrs before
    expect(isInFreezeWindow(shift, config, now)).toBe(false)
  })

  it("returns true one second past the freeze boundary", () => {
    const now = new Date("2025-01-09T12:00:01Z") // 24hrs - 1 second
    expect(isInFreezeWindow(shift, config, now)).toBe(true)
  })

  it("returns false one second before the freeze boundary", () => {
    const now = new Date("2025-01-09T11:59:59Z") // 24hrs + 1 second
    expect(isInFreezeWindow(shift, config, now)).toBe(false)
  })

  it("returns true when shift is in the past", () => {
    const now = new Date("2025-01-11T12:00:00Z") // 24hrs after
    expect(isInFreezeWindow(shift, config, now)).toBe(true)
  })

  it("respects configurable freeze window sizes", () => {
    const twoHourConfig = { freezeWindowHours: 2 }
    const justBefore = new Date("2025-01-10T09:59:59Z") // 2hrs+1s before
    const justInside = new Date("2025-01-10T10:00:01Z") // 1hrs59m before
    expect(isInFreezeWindow(shift, twoHourConfig, justBefore)).toBe(false)
    expect(isInFreezeWindow(shift, twoHourConfig, justInside)).toBe(true)
  })
})

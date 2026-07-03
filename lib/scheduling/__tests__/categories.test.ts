import { describe, it, expect } from "vitest"
import { needsAvailability, isAssignable, notificationMode } from "../categories"
import { fallbackAssign } from "../generate"

describe("needsAvailability", () => {
  it("Minijob/Zeitarbeit must submit availability to be schedulable", () => {
    expect(needsAvailability("MINIJOB_ZEITARBEIT")).toBe(true)
  })

  it("Teilzeit/Fest is schedulable without any availability submission", () => {
    expect(needsAvailability("TEILZEIT_FEST")).toBe(false)
  })
})

describe("isAssignable", () => {
  it("category A only within submitted availability — hard boundary", () => {
    expect(isAssignable("MINIJOB_ZEITARBEIT", true)).toBe(true)
    expect(isAssignable("MINIJOB_ZEITARBEIT", false)).toBe(false)
  })

  it("category B assignable regardless of availability", () => {
    expect(isAssignable("TEILZEIT_FEST", true)).toBe(true)
    expect(isAssignable("TEILZEIT_FEST", false)).toBe(true)
  })
})

describe("notificationMode", () => {
  it("category A gets accept/decline; category B gets info + change request only", () => {
    expect(notificationMode("MINIJOB_ZEITARBEIT")).toBe("ACCEPT_DECLINE")
    expect(notificationMode("TEILZEIT_FEST")).toBe("INFO_CHANGE_REQUEST")
  })
})

describe("fallbackAssign with categories", () => {
  const template = {
    id: "t1",
    name: "Evening",
    startTime: "17:00",
    endTime: "22:00",
    minHeadcount: 1,
    requiredRoles: [],
  }
  const base = { roles: [], minHours: 0, maxHours: 40 }

  it("assigns a category-B employee with zero availability; never a category-A one", () => {
    const festWorker = { id: "fest", name: "Fest", category: "TEILZEIT_FEST" as const, ...base }
    const minijobber = { id: "mini", name: "Mini", category: "MINIJOB_ZEITARBEIT" as const, ...base }

    // No availability submitted by anyone.
    const withFest = fallbackAssign([template], [festWorker], [])
    expect(withFest.every((a) => a.employeeId === "fest" && a.filled)).toBe(true)

    const withMini = fallbackAssign([template], [minijobber], [])
    expect(withMini.every((a) => a.employeeId === null && !a.filled)).toBe(true)
  })

  it("category A still assignable inside submitted availability", () => {
    const minijobber = { id: "mini", name: "Mini", category: "MINIJOB_ZEITARBEIT" as const, ...base }
    const avail = [{ employeeId: "mini", shiftTemplateId: "t1", dayOfWeek: 3, available: true }]
    const result = fallbackAssign([template], [minijobber], avail)
    const day3 = result.find((a) => a.dayOfWeek === 3)
    expect(day3?.employeeId).toBe("mini")
    expect(result.filter((a) => a.employeeId === "mini")).toHaveLength(1)
  })
})

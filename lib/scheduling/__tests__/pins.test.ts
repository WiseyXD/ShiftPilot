import { describe, it, expect } from "vitest"
import { pinsForWeek, isBlocked } from "../pins"
import { fallbackAssign } from "../generate"

describe("pinsForWeek", () => {
  const monday = new Date(2026, 6, 6)
  it("permanent pins apply every week; week pins only their week", () => {
    const pins = [
      { employeeId: "a", shiftTemplateId: "t", dayOfWeek: 1, weekStart: null },
      { employeeId: "b", shiftTemplateId: "t", dayOfWeek: 2, weekStart: new Date(2026, 6, 6) },
      { employeeId: "c", shiftTemplateId: "t", dayOfWeek: 3, weekStart: new Date(2026, 6, 13) },
    ]
    expect(pinsForWeek(pins, monday).map((p) => p.employeeId)).toEqual(["a", "b"])
  })
})

describe("isBlocked", () => {
  const blocks = [
    { employeeId: "a", shiftTemplateId: null, dayOfWeek: 1 }, // whole Monday
    { employeeId: "b", shiftTemplateId: "evening", dayOfWeek: 5 },
  ]
  it("whole-day blocks hit every template; template blocks only theirs", () => {
    expect(isBlocked(blocks, "a", "anything", 1)).toBe(true)
    expect(isBlocked(blocks, "a", "anything", 2)).toBe(false)
    expect(isBlocked(blocks, "b", "evening", 5)).toBe(true)
    expect(isBlocked(blocks, "b", "morning", 5)).toBe(false)
  })
})

describe("fallbackAssign with pins and blocks", () => {
  const tmpl = { id: "t1", name: "Day", startTime: "10:00", endTime: "16:00", minHeadcount: 1, requiredRoles: [] }
  const mk = (id: string) => ({
    id,
    name: id,
    roles: [],
    minHours: 0,
    maxHours: 80,
    category: "TEILZEIT_FEST" as const,
  })
  const anna = mk("anna")
  const ben = mk("ben")

  it("a pin wins the slot even when fairness would pick someone else", () => {
    // Ben has fewer hours everywhere, but Monday (dayOfWeek 1) is pinned to Anna.
    const { assignments } = fallbackAssign([tmpl], [anna, ben], [], {
      pins: [{ employeeId: "anna", shiftTemplateId: "t1", dayOfWeek: 1, weekStart: null }],
    })
    expect(assignments.find((a) => a.dayOfWeek === 1)?.employeeId).toBe("anna")
  })

  it("a blocked employee is never assigned to that slot", () => {
    const { assignments } = fallbackAssign([tmpl], [anna], [], {
      blocks: [{ employeeId: "anna", shiftTemplateId: null, dayOfWeek: 3 }],
    })
    const wednesday = assignments.find((a) => a.dayOfWeek === 3)
    expect(wednesday?.employeeId).toBeNull()
    expect(assignments.filter((a) => a.employeeId === "anna").length).toBe(6)
  })

  it("a pin colliding with a Sperrzeit is reported as a conflict, not silently placed", () => {
    const { assignments, conflicts } = fallbackAssign([tmpl], [anna, ben], [], {
      pins: [{ employeeId: "anna", shiftTemplateId: "t1", dayOfWeek: 1, weekStart: null }],
      blocks: [{ employeeId: "anna", shiftTemplateId: null, dayOfWeek: 1 }],
    })
    expect(assignments.find((a) => a.dayOfWeek === 1)?.employeeId).toBe("ben") // falls through
    expect(conflicts.some((c) => c.includes("anna") && c.toLowerCase().includes("sperrzeit"))).toBe(true)
  })
})

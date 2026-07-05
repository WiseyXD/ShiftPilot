import { describe, it, expect } from "vitest"
import {
  neverTogetherViolated,
  maxShiftsReached,
  dayPreference,
  resolveNames,
  type StructuredRule,
} from "../manager-rules"
import { fallbackAssign } from "../generate"

const slot = (start: string, end: string) => {
  const mk = (t: string) => new Date(`2026-07-06T${t}:00`)
  return { start: mk(start), end: mk(end) }
}

describe("neverTogetherViolated", () => {
  const rule: StructuredRule = { kind: "NEVER_TOGETHER", employeeIds: ["a", "b"] }

  it("fires only when the partner's shift overlaps the candidate slot", () => {
    const byEmp = { b: [slot("10:00", "16:00")] }
    expect(neverTogetherViolated([rule], "a", slot("12:00", "18:00"), byEmp)).toBe(true)
    expect(neverTogetherViolated([rule], "a", slot("17:00", "22:00"), byEmp)).toBe(false) // no overlap
    expect(neverTogetherViolated([rule], "c", slot("12:00", "18:00"), byEmp)).toBe(false) // not in pair
  })
})

describe("maxShiftsReached", () => {
  const rule: StructuredRule = { kind: "MAX_SHIFTS_PER_WEEK", employeeIds: ["a"], maxPerWeek: 2 }
  it("caps assignment count for the named employee only", () => {
    expect(maxShiftsReached([rule], "a", { a: 2 })).toBe(true)
    expect(maxShiftsReached([rule], "a", { a: 1 })).toBe(false)
    expect(maxShiftsReached([rule], "b", { b: 9 })).toBe(false)
  })
})

describe("dayPreference", () => {
  const rules: StructuredRule[] = [
    { kind: "PREFER_DAY", employeeIds: ["a"], dayOfWeek: 6 },
    { kind: "AVOID_DAY", employeeIds: ["a"], dayOfWeek: 1 },
  ]
  it("+1 preferred, -1 avoided, 0 otherwise", () => {
    expect(dayPreference(rules, "a", 6)).toBe(1)
    expect(dayPreference(rules, "a", 1)).toBe(-1)
    expect(dayPreference(rules, "a", 3)).toBe(0)
    expect(dayPreference(rules, "b", 6)).toBe(0)
  })
})

describe("resolveNames", () => {
  const employees = [
    { id: "e1", name: "Anna Schmidt" },
    { id: "e2", name: "Ben Meyer" },
    { id: "e3", name: "Anna Weber" },
  ]
  it("resolves unique case-insensitive matches", () => {
    expect(resolveNames(["ben"], employees)).toEqual({ ok: true, ids: ["e2"] })
  })
  it("ambiguous or unknown names are rejected, never guessed", () => {
    const ambiguous = resolveNames(["Anna"], employees)
    expect(ambiguous.ok).toBe(false)
    if (!ambiguous.ok) expect(ambiguous.error).toMatch(/Anna/)
    expect(resolveNames(["Zed"], employees).ok).toBe(false)
  })
})

describe("solver enforcement at level 5", () => {
  const day = { id: "day", name: "Day", startTime: "10:00", endTime: "16:00", minHeadcount: 1, requiredRoles: [] }
  const eve = { id: "eve", name: "Eve", startTime: "12:00", endTime: "18:00", minHeadcount: 1, requiredRoles: [] }
  const mk = (id: string) => ({
    id,
    name: id,
    roles: [],
    minHours: 0,
    maxHours: 80,
    category: "TEILZEIT_FEST" as const,
  })

  it("never-together: the pair never lands on overlapping shifts", () => {
    const { assignments } = fallbackAssign([day, eve], [mk("a"), mk("b")], [], {
      managerRules: [{ kind: "NEVER_TOGETHER", employeeIds: ["a", "b"] }],
    })
    for (let d = 0; d < 7; d++) {
      const dayEmp = assignments.find((x) => x.shiftTemplateId === "day" && x.dayOfWeek === d)?.employeeId
      const eveEmp = assignments.find((x) => x.shiftTemplateId === "eve" && x.dayOfWeek === d)?.employeeId
      // With only the forbidden pair on staff, overlapping same-day slots can
      // never both be filled (same person twice would blow the daily cap).
      expect(dayEmp && eveEmp).toBeFalsy()
    }
  })

  it("max-shifts-per-week caps the named employee", () => {
    const { assignments } = fallbackAssign([day], [mk("a")], [], {
      managerRules: [{ kind: "MAX_SHIFTS_PER_WEEK", employeeIds: ["a"], maxPerWeek: 3 }],
    })
    expect(assignments.filter((x) => x.employeeId === "a")).toHaveLength(3)
  })
})

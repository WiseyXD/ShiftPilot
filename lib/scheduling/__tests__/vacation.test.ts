import { describe, it, expect } from "vitest"
import { isOnVacation } from "../vacation"
import { fallbackAssign } from "../generate"

const vacations = [
  {
    employeeId: "anna",
    startDate: new Date("2026-07-08T00:00:00Z"), // Wed
    endDate: new Date("2026-07-10T00:00:00Z"), // Fri (inclusive)
  },
]

describe("isOnVacation", () => {
  it("covers the range inclusively on both boundary days", () => {
    expect(isOnVacation(vacations, "anna", new Date(2026, 6, 7))).toBe(false) // Tue
    expect(isOnVacation(vacations, "anna", new Date(2026, 6, 8))).toBe(true) // Wed start
    expect(isOnVacation(vacations, "anna", new Date(2026, 6, 10, 18, 30))).toBe(true) // Fri evening
    expect(isOnVacation(vacations, "anna", new Date(2026, 6, 11))).toBe(false) // Sat
  })

  it("only hits the vacationing employee", () => {
    expect(isOnVacation(vacations, "ben", new Date(2026, 6, 9))).toBe(false)
  })
})

describe("fallbackAssign with vacations", () => {
  const tmpl = { id: "t1", name: "Day", startTime: "10:00", endTime: "16:00", minHeadcount: 1, requiredRoles: [] }
  const anna = { id: "anna", name: "Anna", roles: [], minHours: 0, maxHours: 80, category: "TEILZEIT_FEST" as const }

  it("skips vacation days but keeps the rest of the week", () => {
    // Week of Monday 2026-07-06; vacation Wed 8th – Fri 10th.
    const { assignments } = fallbackAssign([tmpl], [anna], [], {
      vacations,
      weekStart: new Date(2026, 6, 6),
    })
    const filledDays = assignments.filter((a) => a.employeeId === "anna").map((a) => a.dayOfWeek).sort()
    // dayOfWeek: Mon=1 Tue=2 Sat=6 Sun=0 stay; Wed=3 Thu=4 Fri=5 gone.
    expect(filledDays).toEqual([0, 1, 2, 6])
  })

  it("without weekStart the vacation filter is inert (no real dates to compare)", () => {
    const { assignments } = fallbackAssign([tmpl], [anna], [], { vacations })
    expect(assignments.every((a) => a.employeeId === "anna")).toBe(true)
  })
})

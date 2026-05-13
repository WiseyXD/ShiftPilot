import { describe, it, expect } from "vitest"
import { rankReplacementCandidates } from "../replacement"
import type { CandidateEmployee, ShiftInfo, AvailableSlot } from "../replacement"

const shift: ShiftInfo = { requiredRoles: ["Barista"], durationHours: 8, dayOfWeek: 1 }

const available: AvailableSlot[] = [
  { employeeId: "emp1", dayOfWeek: 1, available: true },
  { employeeId: "emp2", dayOfWeek: 1, available: true },
  { employeeId: "emp3", dayOfWeek: 1, available: true },
  { employeeId: "emp4", dayOfWeek: 1, available: true },
]

const base: CandidateEmployee = {
  id: "emp1",
  name: "Alice",
  roles: ["Barista"],
  minHours: 20,
  maxHours: 40,
  assignedHoursThisWeek: 16,
  hasVolunteeredForExtra: false,
}

describe("rankReplacementCandidates", () => {
  it("excludes the employee who declined", () => {
    const candidates = [{ ...base, id: "declined" }]
    const result = rankReplacementCandidates(candidates, shift, available, "declined")
    expect(result).toHaveLength(0)
  })

  it("excludes employees not available on the day", () => {
    const unavailable: AvailableSlot[] = [{ employeeId: "emp1", dayOfWeek: 2, available: true }]
    const result = rankReplacementCandidates([base], shift, unavailable, "other")
    expect(result).toHaveLength(0)
  })

  it("excludes employees who would exceed maxHours", () => {
    const full = { ...base, assignedHoursThisWeek: 35 } // 35 + 8 > 40
    const result = rankReplacementCandidates([full], shift, available, "other")
    expect(result).toHaveLength(0)
  })

  it("excludes employees without required role", () => {
    const noRole = { ...base, roles: ["Chef"] }
    const result = rankReplacementCandidates([noRole], shift, available, "other")
    expect(result).toHaveLength(0)
  })

  it("assigns priority 1 to volunteers", () => {
    const volunteer = { ...base, hasVolunteeredForExtra: true }
    const result = rankReplacementCandidates([volunteer], shift, available, "other")
    expect(result[0].priority).toBe(1)
  })

  it("assigns priority 2 to employees under minHours", () => {
    const underMin = { ...base, assignedHoursThisWeek: 10 } // 10 < 20
    const result = rankReplacementCandidates([underMin], shift, available, "other")
    expect(result[0].priority).toBe(2)
  })

  it("assigns priority 3 to regular available employees", () => {
    const regular = { ...base, assignedHoursThisWeek: 24 } // above minHours
    const result = rankReplacementCandidates([regular], shift, available, "other")
    expect(result[0].priority).toBe(3)
  })

  it("sorts volunteers before under-min-hours before regular", () => {
    const emp2: CandidateEmployee = { ...base, id: "emp2", name: "Bob", assignedHoursThisWeek: 8, hasVolunteeredForExtra: false }  // under min
    const emp3: CandidateEmployee = { ...base, id: "emp3", name: "Carol", assignedHoursThisWeek: 24, hasVolunteeredForExtra: false } // regular
    const emp4: CandidateEmployee = { ...base, id: "emp4", name: "Dave", hasVolunteeredForExtra: true } // volunteer

    const result = rankReplacementCandidates([emp2, emp3, emp4], shift, available, "other")
    expect(result.map((r) => r.priority)).toEqual([1, 2, 3])
    expect(result[0].employeeId).toBe("emp4")
    expect(result[1].employeeId).toBe("emp2")
    expect(result[2].employeeId).toBe("emp3")
  })

  it("within same priority, ranks by fairness score (fewer relative hours first)", () => {
    const moreHours: CandidateEmployee = { ...base, id: "emp2", name: "Bob", assignedHoursThisWeek: 32 }
    const fewerHours: CandidateEmployee = { ...base, id: "emp3", name: "Carol", assignedHoursThisWeek: 20 }

    const result = rankReplacementCandidates([moreHours, fewerHours], shift, available, "other")
    expect(result[0].employeeId).toBe("emp3") // fewer hours = more fair
    expect(result[1].employeeId).toBe("emp2")
  })

  it("returns empty when no eligible candidates exist", () => {
    const result = rankReplacementCandidates([], shift, available, "other")
    expect(result).toHaveLength(0)
  })
})

import { describe, it, expect } from "vitest"
import { DEFAULT_COMPLIANCE_RULES } from "../rules"
import { ageOn, checkEmployeeAssignment } from "../check"

const rules = DEFAULT_COMPLIANCE_RULES

// Week of Monday 2026-07-06. day: 0=Mon offset … 6=Sunday 2026-07-12.
const shift = (dayOffset: number, start: string, end: string) => {
  const mk = (t: string) => new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T${t}:00`)
  return { start: mk(start), end: mk(end) }
}

// Birthdates producing a given age on 2026-07-06.
const aged = (years: number) => new Date(`${2026 - years}-01-15T00:00:00Z`)

describe("ageOn", () => {
  it("computes age at the shift date, respecting the birthday boundary", () => {
    const seventeenth = new Date("2009-07-10T00:00:00Z")
    expect(ageOn(seventeenth, new Date("2026-07-09"))).toBe(16)
    expect(ageOn(seventeenth, new Date("2026-07-10"))).toBe(17)
  })
})

describe("checkEmployeeAssignment — adults and unknown age", () => {
  it("adults get ArbZG rules (8h day cap)", () => {
    const v = checkEmployeeAssignment({ birthDate: aged(30) }, shift(0, "09:00", "20:00"), [], rules)
    expect(v?.rule).toBe("DAILY_MAX")
  })

  it("no birthdate = treated as adult", () => {
    expect(checkEmployeeAssignment({ birthDate: null }, shift(0, "09:00", "17:00"), [], rules)).toBeNull()
  })
})

describe("checkEmployeeAssignment — minors (15–17)", () => {
  const minor16 = { birthDate: aged(16) }
  const minor15 = { birthDate: aged(15) }

  it("under 15: never schedulable at all", () => {
    const v = checkEmployeeAssignment({ birthDate: aged(14) }, shift(0, "10:00", "12:00"), [], rules)
    expect(v?.rule).toBe("UNDER_15")
  })

  it("40h weekly cap (stricter than adults)", () => {
    // Five 8h-net days (8.5h span, 30min break tier at >6h... minor tiers: >4.5→30, >6→60)
    // 9h span − 60min = 8h net. Five of those = 40h.
    const existing = [0, 1, 2, 3, 4].map((d) => shift(d, "08:00", "17:00"))
    const v = checkEmployeeAssignment(minor16, shift(5, "08:00", "11:00"), existing, rules)
    expect(v?.rule).toBe("WEEKLY_MAX")
  })

  it("12h rest between working days (not 10h)", () => {
    const existing = [shift(0, "12:00", "20:00")]
    // Next day 07:00 = 11h rest — fine for adults, illegal for minors
    const v = checkEmployeeAssignment(minor16, shift(1, "07:00", "12:00"), existing, rules)
    expect(v?.rule).toBe("REST_PERIOD")
    const adult = checkEmployeeAssignment({ birthDate: aged(25) }, shift(1, "07:00", "12:00"), existing, rules)
    expect(adult).toBeNull()
  })

  it("night cutoff: 15-year-old ends by 20:00; 16+ in gastro by 22:00", () => {
    expect(checkEmployeeAssignment(minor15, shift(0, "14:00", "21:00"), [], rules)?.rule).toBe("NIGHT_CUTOFF")
    expect(checkEmployeeAssignment(minor16, shift(0, "14:00", "21:00"), [], rules)).toBeNull()
    expect(checkEmployeeAssignment(minor16, shift(0, "16:00", "22:30"), [], rules)?.rule).toBe("NIGHT_CUTOFF")
  })

  it("5-day week: a sixth working day is blocked", () => {
    const existing = [0, 1, 2, 3, 4].map((d) => shift(d, "10:00", "14:00"))
    const v = checkEmployeeAssignment(minor16, shift(5, "10:00", "14:00"), existing, rules)
    expect(v?.rule).toBe("FIVE_DAY_WEEK")
    // Second shift on an already-worked day is NOT a new working day
    expect(checkEmployeeAssignment(minor16, shift(4, "16:00", "19:00"), existing, rules)).toBeNull()
  })

  it("Sundays blocked for minors (v1 conservative reading)", () => {
    const v = checkEmployeeAssignment(minor16, shift(6, "10:00", "14:00"), [], rules)
    expect(v?.rule).toBe("SUNDAY_MINOR")
  })

  it("daily cap uses minor break tiers (>4.5h→30min, >6h→60min)", () => {
    // 9.5h span − 60min = 8.5h net > 8h daily max
    const v = checkEmployeeAssignment(minor16, shift(0, "08:00", "17:30"), [], rules)
    expect(v?.rule).toBe("DAILY_MAX")
    // 9h span − 60min = 8h net — exactly at the cap
    expect(checkEmployeeAssignment(minor16, shift(0, "08:00", "17:00"), [], rules)).toBeNull()
  })
})

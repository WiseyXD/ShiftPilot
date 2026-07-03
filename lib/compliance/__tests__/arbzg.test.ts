import { describe, it, expect } from "vitest"
import { DEFAULT_ARBZG_RULES, rulesForDate } from "../rules"
import { requiredBreakMinutes, netWorkHours, checkAssignment } from "../arbzg"

const rules = DEFAULT_ARBZG_RULES

// Helper: a shift on a given day (2026-07-06 = Monday) with times.
const shift = (day: number, start: string, end: string) => {
  const mk = (t: string) => new Date(`2026-07-${String(6 + day).padStart(2, "0")}T${t}:00`)
  return { start: mk(start), end: mk(end) }
}

describe("rulesForDate", () => {
  it("picks the latest rule set effective on the date", () => {
    const versions = [
      { effectiveFrom: new Date("2020-01-01"), rules: { ...rules, maxWeeklyHours: 50 } },
      { effectiveFrom: new Date("2026-01-01"), rules },
    ]
    expect(rulesForDate(new Date("2026-07-01"), versions).maxWeeklyHours).toBe(48)
    expect(rulesForDate(new Date("2025-06-01"), versions).maxWeeklyHours).toBe(50)
  })

  it("falls back to defaults when no version applies", () => {
    expect(rulesForDate(new Date("2019-01-01"), [])).toEqual(DEFAULT_ARBZG_RULES)
  })
})

describe("requiredBreakMinutes", () => {
  it("tiers: ≤6h none, >6h 30min, >9h 45min", () => {
    expect(requiredBreakMinutes(6, rules)).toBe(0)
    expect(requiredBreakMinutes(6.5, rules)).toBe(30)
    expect(requiredBreakMinutes(9, rules)).toBe(30)
    expect(requiredBreakMinutes(9.5, rules)).toBe(45)
  })
})

describe("netWorkHours", () => {
  it("subtracts the required break from the shift span", () => {
    expect(netWorkHours(shift(0, "09:00", "15:00"), rules)).toBe(6) // no break
    expect(netWorkHours(shift(0, "09:00", "17:30"), rules)).toBe(8) // 8.5h span − 30min
  })
})

describe("checkAssignment", () => {
  it("passes a normal shift", () => {
    expect(checkAssignment(shift(0, "09:00", "17:00"), [], rules)).toBeNull()
  })

  it("blocks a single shift whose net work exceeds the daily max", () => {
    // 11h span − 45min break = 10.25h net > 8h
    const v = checkAssignment(shift(0, "09:00", "20:00"), [], rules)
    expect(v?.rule).toBe("DAILY_MAX")
    expect(v?.detail).toMatch(/8/)
  })

  it("blocks when the day's accumulated net hours would exceed the daily max", () => {
    // 6h morning (net 6) + 3h evening = 9h net on one day
    const existing = [shift(0, "08:00", "14:00")]
    const v = checkAssignment(shift(0, "18:00", "21:00"), existing, rules)
    expect(v?.rule).toBe("DAILY_MAX")
    // 6h morning + 2h evening = 8h exactly → fine
    expect(checkAssignment(shift(0, "18:00", "20:00"), existing, rules)).toBeNull()
  })

  it("blocks when the week's accumulated net hours would exceed the weekly max", () => {
    // Six days of 8.5h span = 8h net each (30min break) → 48h net already
    const existing = [0, 1, 2, 3, 4, 5].map((d) => shift(d, "09:00", "17:30"))
    const v = checkAssignment(shift(6, "09:00", "12:00"), existing, rules)
    expect(v?.rule).toBe("WEEKLY_MAX")
    expect(v?.detail).toMatch(/48/)
    // At exactly 48h net (only five previous days) the sixth 8h-net day is fine
    expect(checkAssignment(shift(6, "09:00", "17:30"), existing.slice(0, 5), rules)).toBeNull()
  })

  it("blocks insufficient rest between working days", () => {
    // Closes Monday 23:00, next shift Tuesday 08:00 → 9h rest < 10h floor
    const existing = [shift(0, "17:00", "23:00")]
    const v = checkAssignment(shift(1, "08:00", "14:00"), existing, rules)
    expect(v?.rule).toBe("REST_PERIOD")
    // Tuesday 09:00 → exactly 10h rest → fine
    expect(checkAssignment(shift(1, "09:00", "15:00"), existing, rules)).toBeNull()
  })

  it("rest check works in both directions (candidate before an existing shift)", () => {
    const existing = [shift(1, "08:00", "14:00")]
    const v = checkAssignment(shift(0, "17:00", "23:00"), existing, rules)
    expect(v?.rule).toBe("REST_PERIOD")
  })

  it("ignores same-day gaps — split shifts are not a rest-period violation", () => {
    const existing = [shift(0, "08:00", "12:00")]
    expect(checkAssignment(shift(0, "15:00", "19:00"), existing, rules)).toBeNull()
  })
})

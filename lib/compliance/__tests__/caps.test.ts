import { describe, it, expect } from "vitest"
import { DEFAULT_COMPLIANCE_RULES } from "../rules"
import { checkEmployeeAssignment } from "../check"
import { minijobCapWarning, countWeeksOverLimit } from "../caps"

const rules = DEFAULT_COMPLIANCE_RULES

const shift = (dayOffset: number, start: string, end: string) => {
  const mk = (t: string) => new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T${t}:00`)
  return { start: mk(start), end: mk(end) }
}

// Minijobber at 13.90 €/h (2026 minimum wage): cap 603 € ⇒ ~43.4 h/month.
const minijobber = {
  birthDate: null,
  category: "MINIJOB_ZEITARBEIT" as const,
  hourlyWageCents: 1390,
}

describe("Minijob earnings cap", () => {
  it("blocks an assignment that would push month earnings past the cap", () => {
    // 40h already this month × 13.90 = 556 €; a 4h shift adds 55.60 → 611.60 > 603
    const v = checkEmployeeAssignment(minijobber, shift(0, "10:00", "14:00"), [], rules, {
      monthNetHoursBeforeWeek: 40,
    })
    expect(v?.rule).toBe("MINIJOB_CAP")
    expect(v?.detail).toMatch(/603/)
  })

  it("counts the current week's shifts toward the month too", () => {
    const existing = [shift(0, "10:00", "14:00")] // 4h this week
    const v = checkEmployeeAssignment(minijobber, shift(1, "10:00", "14:00"), existing, rules, {
      monthNetHoursBeforeWeek: 36,
    })
    expect(v?.rule).toBe("MINIJOB_CAP") // (36 + 4 + 4) × 13.90 = 611.60 €
  })

  it("passes under the cap, and without a wage the cap can't be evaluated", () => {
    expect(
      checkEmployeeAssignment(minijobber, shift(0, "10:00", "14:00"), [], rules, {
        monthNetHoursBeforeWeek: 10,
      })
    ).toBeNull()
    expect(
      checkEmployeeAssignment({ ...minijobber, hourlyWageCents: null }, shift(0, "10:00", "14:00"), [], rules, {
        monthNetHoursBeforeWeek: 100,
      })
    ).toBeNull()
  })

  it("category B is not a Minijob — cap does not apply", () => {
    const fest = { ...minijobber, category: "TEILZEIT_FEST" as const }
    expect(
      checkEmployeeAssignment(fest, shift(0, "10:00", "14:00"), [], rules, {
        monthNetHoursBeforeWeek: 100,
      })
    ).toBeNull()
  })
})

describe("minijobCapWarning", () => {
  it("warns at the threshold before the cap is reached", () => {
    // 80% of 603 € = 482.40 € → at 13.90/h that's ~34.7h
    expect(minijobCapWarning(1390, 35, rules.minijob)).toBe(true)
    expect(minijobCapWarning(1390, 20, rules.minijob)).toBe(false)
    expect(minijobCapWarning(null, 100, rules.minijob)).toBe(false)
  })
})

describe("Werkstudent 20h week", () => {
  const student = {
    birthDate: null,
    category: "TEILZEIT_FEST" as const,
    isWerkstudent: true,
    lectureFree: false,
  }

  it("blocks a week going past 20h during lecture time", () => {
    const existing = [0, 1, 2].map((d) => shift(d, "10:00", "16:00")) // 3 × 6h = 18h
    const v = checkEmployeeAssignment(student, shift(3, "10:00", "13:00"), existing, rules)
    expect(v?.rule).toBe("WERKSTUDENT_WEEKLY") // 21h > 20h
    expect(checkEmployeeAssignment(student, shift(3, "10:00", "12:00"), existing, rules)).toBeNull() // 20h exactly
  })

  it("lecture-free period lifts the cap (ArbZG still applies)", () => {
    const existing = [0, 1, 2].map((d) => shift(d, "10:00", "16:00"))
    const free = { ...student, lectureFree: true }
    expect(checkEmployeeAssignment(free, shift(3, "10:00", "13:00"), existing, rules)).toBeNull()
  })
})

describe("countWeeksOverLimit", () => {
  it("counts weeks above the threshold toward the 26-week budget", () => {
    expect(countWeeksOverLimit([18, 22, 20, 25.5], 20)).toBe(2)
    expect(countWeeksOverLimit([], 20)).toBe(0)
  })
})

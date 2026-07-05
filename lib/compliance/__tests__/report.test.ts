import { describe, it, expect } from "vitest"
import { DEFAULT_COMPLIANCE_RULES } from "../rules"
import { bindingWeeklyMax } from "../report"

const rules = DEFAULT_COMPLIANCE_RULES
const aged = (years: number) => new Date(`${2026 - years}-01-15T00:00:00Z`)
const asOf = new Date("2026-07-06")

const base = {
  birthDate: aged(30),
  category: "TEILZEIT_FEST" as const,
  maxHours: 60,
  hourlyWageCents: null,
  isWerkstudent: false,
  lectureFree: false,
}

describe("bindingWeeklyMax — the smallest applicable limit wins, labeled", () => {
  it("adult with generous contract: ArbZG 48h binds", () => {
    expect(bindingWeeklyMax(base, 0, rules, asOf)).toEqual({ hours: 48, source: "ArbZG" })
  })

  it("tight contract binds below the law", () => {
    expect(bindingWeeklyMax({ ...base, maxHours: 30 }, 0, rules, asOf)).toEqual({
      hours: 30,
      source: "contract",
    })
  })

  it("minor: JArbSchG 40h binds", () => {
    expect(bindingWeeklyMax({ ...base, birthDate: aged(16) }, 0, rules, asOf)).toEqual({
      hours: 40,
      source: "JArbSchG",
    })
  })

  it("Werkstudent in lecture time: 20h binds; lecture-free lifts it", () => {
    expect(bindingWeeklyMax({ ...base, isWerkstudent: true }, 0, rules, asOf)).toEqual({
      hours: 20,
      source: "Werkstudent",
    })
    expect(bindingWeeklyMax({ ...base, isWerkstudent: true, lectureFree: true }, 0, rules, asOf).source).toBe(
      "ArbZG"
    )
  })

  it("Minijob: remaining earnings translate to remaining hours", () => {
    // Cap 603 €, wage 13.90 €/h, 30h already this month → 603−417=186 € left → ~13.4h
    const mini = { ...base, category: "MINIJOB_ZEITARBEIT" as const, hourlyWageCents: 1390 }
    const result = bindingWeeklyMax(mini, 30, rules, asOf)
    expect(result.source).toBe("Minijob cap")
    expect(result.hours).toBeCloseTo((60300 - 1390 * 30) / 1390, 1)
  })

  it("Minijob cap already exhausted → zero, never negative", () => {
    const mini = { ...base, category: "MINIJOB_ZEITARBEIT" as const, hourlyWageCents: 1390 }
    expect(bindingWeeklyMax(mini, 50, rules, asOf)).toEqual({ hours: 0, source: "Minijob cap" })
  })
})

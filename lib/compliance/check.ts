// Age-aware dispatcher: adults get ArbZG, minors (15–17) get JArbSchG, under-15
// gets nothing at all. Pure — the single entry point every assignment door uses.

import { checkAssignment, netWorkHours, type PlannedShift, type Violation } from "./arbzg"
import { minijobEarningsCents } from "./caps"
import type { ComplianceRules } from "./rules"

export type ComplianceViolation =
  | Violation
  | {
      rule:
        | "UNDER_15"
        | "NIGHT_CUTOFF"
        | "FIVE_DAY_WEEK"
        | "SUNDAY_MINOR"
        | "MINIJOB_CAP"
        | "WERKSTUDENT_WEEKLY"
      detail: string
    }

export interface AgedEmployee {
  birthDate?: Date | string | null
  category?: "MINIJOB_ZEITARBEIT" | "TEILZEIT_FEST"
  hourlyWageCents?: number | null
  isWerkstudent?: boolean
  lectureFree?: boolean
}

export interface AssignmentContext {
  // Net hours already worked earlier THIS MONTH (before the week under
  // consideration) — feeds the Minijob earnings cap. Defaults to 0 when the
  // caller has no month history.
  monthNetHoursBeforeWeek?: number
}

// Full years at `date`, birthday boundary respected (UTC on both sides).
export function ageOn(birthDate: Date | string, date: Date): number {
  const birth = new Date(birthDate)
  let age = date.getUTCFullYear() - birth.getUTCFullYear()
  const beforeBirthday =
    date.getUTCMonth() < birth.getUTCMonth() ||
    (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate())
  if (beforeBirthday) age--
  return age
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes()
const parseHM = (t: string) => {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

export function checkEmployeeAssignment(
  employee: AgedEmployee,
  candidate: PlannedShift,
  existing: PlannedShift[],
  rules: ComplianceRules,
  context: AssignmentContext = {}
): ComplianceViolation | null {
  const statusViolation = checkStatusCaps(employee, candidate, existing, rules, context)
  if (statusViolation) return statusViolation

  const age = employee.birthDate ? ageOn(employee.birthDate, candidate.start) : null

  // Unknown age is treated as adult — v1 pragmatism; the JArbSchG UI hint
  // nudges managers to record birthdates for anyone young.
  if (age === null || age >= 18) return checkAssignment(candidate, existing, rules.arbzg)

  const minor = rules.jarbschg

  if (age < minor.minAgeYears) {
    return { rule: "UNDER_15", detail: `age ${age} — employment of under-15s is prohibited` }
  }

  // v1 conservative reading: minors are never scheduled on Sundays (the gastro
  // exception requires compensation tracking we don't model yet).
  if (candidate.start.getDay() === 0) {
    return { rule: "SUNDAY_MINOR", detail: "minors are not scheduled on Sundays (v1 policy)" }
  }

  const cutoff = parseHM(age >= 16 ? minor.nightEndGastro16Plus : minor.nightEndDefault)
  const crossesMidnight = dayKey(candidate.end) !== dayKey(candidate.start)
  if (crossesMidnight || minutesOfDay(candidate.end) > cutoff) {
    return {
      rule: "NIGHT_CUTOFF",
      detail: `shift ends ${candidate.end.toTimeString().slice(0, 5)} — a ${age}-year-old must finish by ${age >= 16 ? minor.nightEndGastro16Plus : minor.nightEndDefault}`,
    }
  }

  // Core caps share the ArbZG engine, run with the stricter minor values.
  const core = checkAssignment(candidate, existing, {
    maxDailyHours: minor.maxDailyHours,
    maxWeeklyHours: minor.maxWeeklyHours,
    minRestHours: minor.minRestHours,
    breakTiers: minor.breakTiers,
  })
  if (core) return core

  const workedDays = new Set(existing.map((s) => dayKey(s.start)))
  if (!workedDays.has(dayKey(candidate.start)) && workedDays.size >= minor.maxWorkDaysPerWeek) {
    return {
      rule: "FIVE_DAY_WEEK",
      detail: `already ${workedDays.size} working days this week — minors get a ${minor.maxWorkDaysPerWeek}-day week`,
    }
  }

  return null
}

// Money/status caps orthogonal to age: Minijob earnings, Werkstudent hours.
function checkStatusCaps(
  employee: AgedEmployee,
  candidate: PlannedShift,
  existing: PlannedShift[],
  rules: ComplianceRules,
  context: AssignmentContext
): ComplianceViolation | null {
  const weekNet =
    netWorkHours(candidate, rules.arbzg) +
    existing.reduce((sum, s) => sum + netWorkHours(s, rules.arbzg), 0)

  if (employee.category === "MINIJOB_ZEITARBEIT" && employee.hourlyWageCents) {
    const monthNet = (context.monthNetHoursBeforeWeek ?? 0) + weekNet
    const earnings = minijobEarningsCents(employee.hourlyWageCents, monthNet)
    if (earnings > rules.minijob.monthlyEarningsCapCents) {
      return {
        rule: "MINIJOB_CAP",
        detail: `${(earnings / 100).toFixed(2)} € this month would exceed the ${(rules.minijob.monthlyEarningsCapCents / 100).toFixed(0)} € Minijob cap`,
      }
    }
  }

  if (employee.isWerkstudent && !employee.lectureFree) {
    if (weekNet > rules.werkstudent.maxWeeklyHoursLecture) {
      return {
        rule: "WERKSTUDENT_WEEKLY",
        detail: `${weekNet.toFixed(2)} h this week exceeds the ${rules.werkstudent.maxWeeklyHoursLecture} h Werkstudent limit during lecture time`,
      }
    }
  }

  return null
}

// Re-export for callers that need the net-hours math alongside the check.
export { netWorkHours }
export type { PlannedShift }

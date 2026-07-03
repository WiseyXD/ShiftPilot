// Deterministic ArbZG validators (concept doc §1a/§4). Pure — rule values come
// in as data, shifts as real start/end datetimes. The LLM never runs these
// numbers; this module is the guarantee.

import type { ArbZGRules } from "./rules"

export interface PlannedShift {
  start: Date
  end: Date
}

export interface Violation {
  rule: "DAILY_MAX" | "WEEKLY_MAX" | "REST_PERIOD"
  detail: string
}

const spanHours = (s: PlannedShift) => (s.end.getTime() - s.start.getTime()) / 3_600_000

export function requiredBreakMinutes(workHours: number, rules: ArbZGRules): number {
  let minutes = 0
  for (const tier of rules.breakTiers) {
    if (workHours > tier.moreThanHours) minutes = tier.breakMinutes
  }
  return minutes
}

// Net worked hours: shift span minus the statutory break it must contain.
// Approximation: tiers are applied on the span (templates don't model breaks).
export function netWorkHours(shift: PlannedShift, rules: ArbZGRules): number {
  const span = spanHours(shift)
  return span - requiredBreakMinutes(span, rules) / 60
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export function checkAssignment(
  candidate: PlannedShift,
  existing: PlannedShift[],
  rules: ArbZGRules
): Violation | null {
  const candidateNet = netWorkHours(candidate, rules)

  // Daily cap — the candidate's day, accumulated across split shifts.
  const sameDay = existing.filter((s) => dayKey(s.start) === dayKey(candidate.start))
  const dayTotal = candidateNet + sameDay.reduce((sum, s) => sum + netWorkHours(s, rules), 0)
  if (dayTotal > rules.maxDailyHours) {
    return {
      rule: "DAILY_MAX",
      detail: `${dayTotal.toFixed(2)} h net on ${candidate.start.toDateString()} exceeds the ${rules.maxDailyHours} h daily maximum`,
    }
  }

  // Weekly cap — everything the caller passed counts as this week.
  const weekTotal = candidateNet + existing.reduce((sum, s) => sum + netWorkHours(s, rules), 0)
  if (weekTotal > rules.maxWeeklyHours) {
    return {
      rule: "WEEKLY_MAX",
      detail: `${weekTotal.toFixed(2)} h net this week exceeds the ${rules.maxWeeklyHours} h weekly maximum`,
    }
  }

  // Rest period — gaps to shifts on OTHER calendar days, in both directions.
  // Same-day gaps are split shifts, not Ruhezeit.
  for (const s of existing) {
    if (dayKey(s.start) === dayKey(candidate.start)) continue
    const gapHours =
      s.end <= candidate.start
        ? (candidate.start.getTime() - s.end.getTime()) / 3_600_000
        : s.start >= candidate.end
          ? (s.start.getTime() - candidate.end.getTime()) / 3_600_000
          : 0 // overlapping across days — no rest at all
    if (gapHours < rules.minRestHours) {
      return {
        rule: "REST_PERIOD",
        detail: `only ${gapHours.toFixed(2)} h rest around ${candidate.start.toDateString()} — minimum is ${rules.minRestHours} h`,
      }
    }
  }

  return null
}

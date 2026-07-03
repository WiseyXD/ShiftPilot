// Money- and status-based caps (concept doc §4.3/§4.4). Pure — cumulative
// hours arrive as inputs; the DB aggregation lives in hours.ts.

import type { MinijobRules } from "./rules"

export function minijobEarningsCents(hourlyWageCents: number, netHours: number): number {
  return Math.round(hourlyWageCents * netHours)
}

// True once month earnings pass the warn threshold — the manager should hear
// about it before assignments start getting blocked.
export function minijobCapWarning(
  hourlyWageCents: number | null | undefined,
  monthNetHours: number,
  rules: MinijobRules
): boolean {
  if (!hourlyWageCents) return false
  const earnings = minijobEarningsCents(hourlyWageCents, monthNetHours)
  return earnings >= rules.monthlyEarningsCapCents * rules.warnAtFraction
}

// Weeks above the lecture-time limit, counted toward the 26-week budget.
export function countWeeksOverLimit(weeklyNetHours: number[], limitHours: number): number {
  return weeklyNetHours.filter((h) => h > limitHours).length
}

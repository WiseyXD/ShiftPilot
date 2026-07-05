// Structured manager rules (concept doc §3, hierarchy level 5). The LLM only
// translates text into these closed kinds — everything here is deterministic.

import type { PlannedShift } from "@/lib/compliance/check"

export interface StructuredRule {
  kind: "NEVER_TOGETHER" | "PREFER_DAY" | "AVOID_DAY" | "MAX_SHIFTS_PER_WEEK"
  employeeIds: string[]
  dayOfWeek?: number | null
  maxPerWeek?: number | null
}

const overlaps = (a: PlannedShift, b: PlannedShift) => a.start < b.end && b.start < a.end

// Hard at level 5: would placing `employeeId` on `slot` put them on an
// overlapping shift with a forbidden partner?
export function neverTogetherViolated(
  rules: StructuredRule[],
  employeeId: string,
  slot: PlannedShift,
  assignedShiftsByEmployee: Record<string, PlannedShift[]>
): boolean {
  for (const rule of rules) {
    if (rule.kind !== "NEVER_TOGETHER" || !rule.employeeIds.includes(employeeId)) continue
    for (const partnerId of rule.employeeIds) {
      if (partnerId === employeeId) continue
      if ((assignedShiftsByEmployee[partnerId] ?? []).some((s) => overlaps(s, slot))) return true
    }
  }
  return false
}

export function maxShiftsReached(
  rules: StructuredRule[],
  employeeId: string,
  assignmentCounts: Record<string, number>
): boolean {
  return rules.some(
    (r) =>
      r.kind === "MAX_SHIFTS_PER_WEEK" &&
      r.employeeIds.includes(employeeId) &&
      r.maxPerWeek != null &&
      (assignmentCounts[employeeId] ?? 0) >= r.maxPerWeek
  )
}

// Soft, between contract hours (4) and wishes (6): +1 preferred, −1 avoided.
export function dayPreference(
  rules: StructuredRule[],
  employeeId: string,
  dayOfWeek: number
): number {
  let score = 0
  for (const rule of rules) {
    if (!rule.employeeIds.includes(employeeId) || rule.dayOfWeek !== dayOfWeek) continue
    if (rule.kind === "PREFER_DAY") score = Math.max(score, 1)
    if (rule.kind === "AVOID_DAY") score = Math.min(score, -1)
  }
  return score
}

// Name → id resolution for LLM drafts: unique, case-insensitive; ambiguity or
// misses are errors, never guesses.
export function resolveNames(
  names: string[],
  employees: { id: string; name: string }[]
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const ids: string[] = []
  for (const name of names) {
    const needle = name.trim().toLowerCase()
    const matches = employees.filter((e) => e.name.toLowerCase().includes(needle))
    if (matches.length === 0) return { ok: false, error: `No employee matches "${name}"` }
    if (matches.length > 1) {
      return {
        ok: false,
        error: `"${name}" is ambiguous — matches ${matches.map((m) => m.name).join(", ")}`,
      }
    }
    ids.push(matches[0].id)
  }
  return { ok: true, ids }
}

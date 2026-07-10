// Pure resolution helpers: week math and mapping the LLM's fuzzy references
// ("Emma", "Friday evening shift") onto concrete rows. Ambiguity is always an
// error listing the options — never a guess (same stance as resolveNames).

import { DAY_LABELS, DEFAULT_LANG, t, type Lang } from "./i18n"

export function currentMonday(now = new Date()): Date {
  const d = new Date(now)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

// weekOffset 0 = the week containing `now`, 1 = next week, …
export function weekStartFor(weekOffset: number, now = new Date()): Date {
  const monday = currentMonday(now)
  monday.setDate(monday.getDate() + weekOffset * 7)
  return monday
}

// Chronological position inside a Monday-start week (Sunday is LAST, day 7).
export const chronologicalDay = (dayOfWeek: number) => ((dayOfWeek + 6) % 7) + 1

export interface ResolvableShift {
  id: string
  dayOfWeek: number
  status: string
  employeeId: string | null
  employeeName: string | null
  templateName: string
  startTime: string
  endTime: string
}

export interface ShiftQuery {
  dayOfWeek?: number | null
  templateName?: string | null
  employeeName?: string | null
  unassignedOnly?: boolean
}

export const shiftLabel = (s: ResolvableShift, lang: Lang = DEFAULT_LANG) =>
  `${DAY_LABELS[lang][s.dayOfWeek]} ${s.templateName} ${s.startTime}–${s.endTime}${s.employeeName ? ` (${s.employeeName})` : ""}`

export function resolveShift(
  shifts: ResolvableShift[],
  query: ShiftQuery,
  lang: Lang = DEFAULT_LANG
): { ok: true; shift: ResolvableShift } | { ok: false; error: string } {
  let candidates = shifts
  if (query.dayOfWeek != null) candidates = candidates.filter((s) => s.dayOfWeek === query.dayOfWeek)
  if (query.templateName) {
    const needle = query.templateName.trim().toLowerCase()
    candidates = candidates.filter((s) => s.templateName.toLowerCase().includes(needle))
  }
  if (query.employeeName) {
    const needle = query.employeeName.trim().toLowerCase()
    candidates = candidates.filter((s) => s.employeeName?.toLowerCase().includes(needle))
  }
  if (query.unassignedOnly) candidates = candidates.filter((s) => s.status === "UNASSIGNED")

  if (candidates.length === 0) return { ok: false, error: t(lang).noShiftMatch }
  if (candidates.length > 1) {
    return {
      ok: false,
      error: t(lang).ambiguousShift(candidates.map((s) => shiftLabel(s, lang)).join("; ")),
    }
  }
  return { ok: true, shift: candidates[0] }
}

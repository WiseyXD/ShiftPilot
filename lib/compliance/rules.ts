// Legal rule values as effective-dated DATA (concept doc §4): they change over
// time and must never be hardcoded into validators. ⚠️ Research values, not
// legal advice — see issue #33 for the review/upkeep process.

export interface ArbZGRules {
  maxDailyHours: number // §3 ArbZG: 8 h (10 h only with 6-month averaging — v1 treats 8 as hard)
  maxWeeklyHours: number // 48 h on a 6-day-week basis
  // Rest between working days. 11 h standard; gastronomy may reduce to 10 h
  // with later compensation — v1 enforces the 10 h floor.
  minRestHours: number
  // Break tiers on the shift span: worked > moreThanHours ⇒ at least breakMinutes.
  breakTiers: { moreThanHours: number; breakMinutes: number }[]
}

export const DEFAULT_ARBZG_RULES: ArbZGRules = {
  maxDailyHours: 8,
  maxWeeklyHours: 48,
  minRestHours: 10,
  breakTiers: [
    { moreThanHours: 6, breakMinutes: 30 },
    { moreThanHours: 9, breakMinutes: 45 },
  ],
}

export interface RuleVersion {
  effectiveFrom: Date
  rules: ArbZGRules
}

// Pure: pick the latest version effective on the date; defaults if none.
export function rulesForDate(date: Date, versions: RuleVersion[]): ArbZGRules {
  const applicable = versions
    .filter((v) => v.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())
  return applicable[0]?.rules ?? DEFAULT_ARBZG_RULES
}

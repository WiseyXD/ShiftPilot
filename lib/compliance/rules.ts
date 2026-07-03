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

// JArbSchG (15–17): stricter caps, earlier nights, 5-day week.
export interface JArbSchGRules {
  maxDailyHours: number // 8
  maxWeeklyHours: number // 40
  minRestHours: number // 12
  breakTiers: { moreThanHours: number; breakMinutes: number }[] // >4.5h→30, >6h→60
  nightEndDefault: string // "20:00" — 15-year-olds
  nightEndGastro16Plus: string // "22:00" — 16+ in gastronomy
  maxWorkDaysPerWeek: number // 5
  minAgeYears: number // 15 — under this: no employment at all
}

export const DEFAULT_JARBSCHG_RULES: JArbSchGRules = {
  maxDailyHours: 8,
  maxWeeklyHours: 40,
  minRestHours: 12,
  breakTiers: [
    { moreThanHours: 4.5, breakMinutes: 30 },
    { moreThanHours: 6, breakMinutes: 60 },
  ],
  nightEndDefault: "20:00",
  nightEndGastro16Plus: "22:00",
  maxWorkDaysPerWeek: 5,
  minAgeYears: 15,
}

// Minijob (2026): cap is coupled to minimum wage — pure data, will change.
export interface MinijobRules {
  monthlyEarningsCapCents: number // 60300 (603 €)
  warnAtFraction: number // 0.8 — alert the manager before blocking
}

export const DEFAULT_MINIJOB_RULES: MinijobRules = {
  monthlyEarningsCapCents: 60300,
  warnAtFraction: 0.8,
}

export interface WerkstudentRules {
  maxWeeklyHoursLecture: number // 20 during lecture time
  maxWeeksOverPerYear: number // 26 — beyond this the privilege falls
}

export const DEFAULT_WERKSTUDENT_RULES: WerkstudentRules = {
  maxWeeklyHoursLecture: 20,
  maxWeeksOverPerYear: 26,
}

export interface ComplianceRules {
  arbzg: ArbZGRules
  jarbschg: JArbSchGRules
  minijob: MinijobRules
  werkstudent: WerkstudentRules
}

export const DEFAULT_COMPLIANCE_RULES: ComplianceRules = {
  arbzg: DEFAULT_ARBZG_RULES,
  jarbschg: DEFAULT_JARBSCHG_RULES,
  minijob: DEFAULT_MINIJOB_RULES,
  werkstudent: DEFAULT_WERKSTUDENT_RULES,
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

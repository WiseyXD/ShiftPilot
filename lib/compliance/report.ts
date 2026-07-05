// Ist/Soll/Max reporting (concept doc §4.5/§10). Pure: the binding weekly
// maximum is the smallest applicable limit, labeled with its legal source.

import { ageOn } from "./check"
import type { ComplianceRules } from "./rules"

export interface ReportEmployee {
  birthDate?: Date | string | null
  category?: "MINIJOB_ZEITARBEIT" | "TEILZEIT_FEST"
  maxHours: number
  hourlyWageCents?: number | null
  isWerkstudent?: boolean
  lectureFree?: boolean
}

export interface BindingMax {
  hours: number
  source: "ArbZG" | "JArbSchG" | "Werkstudent" | "Minijob cap" | "contract"
}

export function bindingWeeklyMax(
  employee: ReportEmployee,
  monthNetHoursBeforeWeek: number,
  rules: ComplianceRules,
  asOf: Date
): BindingMax {
  const candidates: BindingMax[] = []

  const age = employee.birthDate ? ageOn(employee.birthDate, asOf) : null
  if (age !== null && age < 18) {
    candidates.push({ hours: rules.jarbschg.maxWeeklyHours, source: "JArbSchG" })
  } else {
    candidates.push({ hours: rules.arbzg.maxWeeklyHours, source: "ArbZG" })
  }

  candidates.push({ hours: employee.maxHours, source: "contract" })

  if (employee.isWerkstudent && !employee.lectureFree) {
    candidates.push({ hours: rules.werkstudent.maxWeeklyHoursLecture, source: "Werkstudent" })
  }

  if (employee.category === "MINIJOB_ZEITARBEIT" && employee.hourlyWageCents) {
    const remainingCents = rules.minijob.monthlyEarningsCapCents - employee.hourlyWageCents * monthNetHoursBeforeWeek
    candidates.push({
      hours: Math.max(0, remainingCents / employee.hourlyWageCents),
      source: "Minijob cap",
    })
  }

  // Smallest limit binds; on ties the earlier (more legal) source keeps the label.
  return candidates.reduce((min, c) => (c.hours < min.hours ? c : min))
}

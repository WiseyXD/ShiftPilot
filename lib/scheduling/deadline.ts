// The deadline rule (concept doc §6.1): no confirmation by generation time →
// not scheduled this week. Category B is schedulable regardless; their
// unanswered wish prompts simply lapse.

import { needsAvailability } from "./categories"
import type { EmployeeCategory } from "@/prisma/generated/client/client"

interface CategorizedEmployee {
  id: string
  category: EmployeeCategory
}

export function partitionSchedulable<T extends CategorizedEmployee>(
  employees: T[],
  confirmedIds: Set<string>
): { schedulable: T[]; dropped: T[] } {
  const schedulable: T[] = []
  const dropped: T[] = []
  for (const emp of employees) {
    if (!needsAvailability(emp.category) || confirmedIds.has(emp.id)) schedulable.push(emp)
    else dropped.push(emp)
  }
  return { schedulable, dropped }
}

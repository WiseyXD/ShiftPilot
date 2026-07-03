// DB boundary: newest rule set effective on the date, defaults if none seeded.

import { prisma } from "@/prisma/client"
import { DEFAULT_COMPLIANCE_RULES, type ComplianceRules } from "./rules"

export async function loadRules(date: Date): Promise<ComplianceRules> {
  const row = await prisma.complianceRuleSet.findFirst({
    where: { effectiveFrom: { lte: date } },
    orderBy: { effectiveFrom: "desc" },
  })
  const stored = row?.rules as Partial<ComplianceRules> | undefined
  return {
    arbzg: stored?.arbzg ?? DEFAULT_COMPLIANCE_RULES.arbzg,
    jarbschg: stored?.jarbschg ?? DEFAULT_COMPLIANCE_RULES.jarbschg,
    minijob: stored?.minijob ?? DEFAULT_COMPLIANCE_RULES.minijob,
    werkstudent: stored?.werkstudent ?? DEFAULT_COMPLIANCE_RULES.werkstudent,
  }
}

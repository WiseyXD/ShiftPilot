// DB boundary: newest rule set effective on the date, defaults if none seeded.

import { prisma } from "@/prisma/client"
import { DEFAULT_ARBZG_RULES, type ArbZGRules } from "./rules"

export async function loadRules(date: Date): Promise<ArbZGRules> {
  const row = await prisma.complianceRuleSet.findFirst({
    where: { effectiveFrom: { lte: date } },
    orderBy: { effectiveFrom: "desc" },
  })
  return (row?.rules as ArbZGRules | undefined) ?? DEFAULT_ARBZG_RULES
}

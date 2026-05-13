import { prisma } from "@/prisma/client"

export interface EffectiveAvailability {
  employeeId: string
  shiftTemplateId: string
  dayOfWeek: number // 0-6
  available: boolean
}

// Merges recurring pattern with per-week overrides.
// Override wins when it exists for the specific date.
export async function getEffectiveAvailability(
  locationId: string,
  weekStart: Date
): Promise<EffectiveAvailability[]> {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [recurring, overrides] = await Promise.all([
    prisma.recurringAvailability.findMany({
      where: { employee: { locationId } },
    }),
    prisma.availabilityOverride.findMany({
      where: {
        employee: { locationId },
        date: { gte: weekStart, lt: weekEnd },
      },
    }),
  ])

  // Build override lookup: "employeeId:templateId:dayOfWeek" → available
  const overrideMap = new Map<string, boolean>()
  for (const o of overrides) {
    const dow = o.date.getDay()
    overrideMap.set(`${o.employeeId}:${o.shiftTemplateId}:${dow}`, o.available)
  }

  return recurring.map((r) => {
    const key = `${r.employeeId}:${r.shiftTemplateId}:${r.dayOfWeek}`
    const override = overrideMap.get(key)
    return {
      employeeId: r.employeeId,
      shiftTemplateId: r.shiftTemplateId,
      dayOfWeek: r.dayOfWeek,
      available: override !== undefined ? override : true,
    }
  })
}

// DB aggregation: net hours already scheduled earlier this month (before the
// week under consideration) — feeds the Minijob earnings cap.

import { prisma } from "@/prisma/client"
import { netWorkHours } from "./arbzg"
import type { ArbZGRules } from "./rules"

const NOMINAL_DAY = new Date(2001, 0, 1)

const toNominal = (t: string) => {
  const [h, m] = t.split(":").map(Number)
  const d = new Date(NOMINAL_DAY)
  d.setHours(h, m, 0, 0)
  return d
}

export async function loadMonthNetHoursBeforeWeek(
  employeeIds: string[],
  weekStart: Date,
  rules: ArbZGRules
): Promise<Record<string, number>> {
  if (employeeIds.length === 0) return {}
  const monthStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1)

  const shifts = await prisma.shift.findMany({
    where: {
      employeeId: { in: employeeIds },
      status: { notIn: ["DECLINED", "UNASSIGNED"] },
      schedule: { weekStart: { gte: monthStart, lt: weekStart } },
    },
    select: { employeeId: true, shiftTemplate: { select: { startTime: true, endTime: true } } },
  })

  const hours: Record<string, number> = {}
  for (const s of shifts) {
    if (!s.employeeId) continue
    const net = netWorkHours(
      { start: toNominal(s.shiftTemplate.startTime), end: toNominal(s.shiftTemplate.endTime) },
      rules
    )
    hours[s.employeeId] = (hours[s.employeeId] ?? 0) + net
  }
  return hours
}

import { prisma } from "@/prisma/client"
import { loadRules } from "@/lib/compliance/load"
import { loadMonthNetHoursBeforeWeek } from "@/lib/compliance/hours"
import { bindingWeeklyMax, type BindingMax } from "@/lib/compliance/report"
import { countWeeksOverLimit } from "@/lib/compliance/caps"

export interface WeeklyAcceptance {
  weekStart: string
  accepted: number
  total: number
  rate: number
}

export interface WeeklyReplacementRate {
  weekStart: string
  resolved: number
  escalated: number
}

export interface EmployeeHours {
  employeeId: string
  name: string
  minHours: number
  maxHours: number
  assignedHours: number
  status: "over" | "under" | "ok"
  /** Smallest applicable weekly limit (law/status/contract), labeled. */
  bindingMax: BindingMax
  /** Approaching the binding max (≥80%). */
  approaching: boolean
  /** Werkstudent only: weeks over 20h this year vs the 26-week budget. */
  weeksOverBudget?: { used: number; budget: number }
}

export interface EmployeeNoShows {
  employeeId: string
  name: string
  count: number
}

function weekLabel(d: Date) {
  return d.toISOString().slice(0, 10)
}

// Returns the Monday of the week 'n' full weeks back from now
function weekStart(weeksBack: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay() + 1 - weeksBack * 7)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function getAcceptanceRateTrend(locationId: string): Promise<WeeklyAcceptance[]> {
  const since = weekStart(8)
  const shifts = await prisma.shift.findMany({
    where: {
      schedule: { locationId, weekStart: { gte: since } },
      employeeId: { not: null },
    },
    include: { schedule: { select: { weekStart: true } } },
  })

  const map = new Map<string, { accepted: number; total: number }>()
  for (const s of shifts) {
    const key = weekLabel(new Date(s.schedule.weekStart))
    const entry = map.get(key) ?? { accepted: 0, total: 0 }
    entry.total++
    if (s.status === "ACCEPTED" || s.status === "REASSIGNED") entry.accepted++
    map.set(key, entry)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, { accepted, total }]) => ({
      weekStart,
      accepted,
      total,
      rate: total > 0 ? Math.round((accepted / total) * 100) : 0,
    }))
}

export async function getReplacementRateTrend(locationId: string): Promise<WeeklyReplacementRate[]> {
  const since = weekStart(8)
  const logs = await prisma.auditLog.findMany({
    where: {
      locationId,
      action: { in: ["SWAP_AUTO_APPROVED", "SWAP_MANAGER_APPROVED", "ESCALATED_TO_MANAGER"] },
      createdAt: { gte: since },
    },
    select: { action: true, createdAt: true },
  })

  const map = new Map<string, { resolved: number; escalated: number }>()
  for (const log of logs) {
    const d = new Date(log.createdAt)
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)
    const key = weekLabel(monday)
    const entry = map.get(key) ?? { resolved: 0, escalated: 0 }
    if (log.action === "ESCALATED_TO_MANAGER") entry.escalated++
    else entry.resolved++
    map.set(key, entry)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, counts]) => ({ weekStart, ...counts }))
}

export async function getHoursDistribution(
  locationId: string,
  targetWeekStart: Date
): Promise<EmployeeHours[]> {
  const weekEnd = new Date(targetWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [employees, shifts, rules] = await Promise.all([
    prisma.employee.findMany({ where: { locationId } }),
    prisma.shift.findMany({
      where: {
        schedule: { locationId, weekStart: { gte: targetWeekStart, lt: weekEnd } },
        status: { not: "DECLINED" },
        employeeId: { not: null },
      },
      include: { shiftTemplate: { select: { startTime: true, endTime: true } } },
    }),
    loadRules(targetWeekStart),
  ])
  const monthHours = await loadMonthNetHoursBeforeWeek(
    employees.map((e) => e.id),
    targetWeekStart,
    rules.arbzg
  )

  // Werkstudent 26-week budget: weekly net hours this calendar year.
  const werkstudents = employees.filter((e) => e.isWerkstudent)
  const budgetByEmployee: Record<string, number> = {}
  if (werkstudents.length > 0) {
    const yearStart = new Date(targetWeekStart.getFullYear(), 0, 1)
    const yearShifts = await prisma.shift.findMany({
      where: {
        employeeId: { in: werkstudents.map((e) => e.id) },
        status: { notIn: ["DECLINED", "UNASSIGNED"] },
        schedule: { weekStart: { gte: yearStart } },
      },
      select: {
        employeeId: true,
        schedule: { select: { weekStart: true } },
        shiftTemplate: { select: { startTime: true, endTime: true } },
      },
    })
    const weekly: Record<string, Record<string, number>> = {}
    for (const s of yearShifts) {
      if (!s.employeeId) continue
      const [sh, sm] = s.shiftTemplate.startTime.split(":").map(Number)
      const [eh, em] = s.shiftTemplate.endTime.split(":").map(Number)
      const h = (eh * 60 + em - (sh * 60 + sm)) / 60
      const wk = new Date(s.schedule.weekStart).toISOString().slice(0, 10)
      ;(weekly[s.employeeId] ??= {})[wk] = (weekly[s.employeeId]?.[wk] ?? 0) + h
    }
    for (const emp of werkstudents) {
      budgetByEmployee[emp.id] = countWeeksOverLimit(
        Object.values(weekly[emp.id] ?? {}),
        rules.werkstudent.maxWeeklyHoursLecture
      )
    }
  }

  const hoursMap: Record<string, number> = {}
  for (const s of shifts) {
    if (!s.employeeId) continue
    const [sh, sm] = s.shiftTemplate.startTime.split(":").map(Number)
    const [eh, em] = s.shiftTemplate.endTime.split(":").map(Number)
    const h = (eh * 60 + em - (sh * 60 + sm)) / 60
    hoursMap[s.employeeId] = (hoursMap[s.employeeId] ?? 0) + h
  }

  return employees.map((emp) => {
    const assigned = hoursMap[emp.id] ?? 0
    const bindingMax = bindingWeeklyMax(emp, monthHours[emp.id] ?? 0, rules, targetWeekStart)
    const status =
      assigned > bindingMax.hours ? "over" : assigned < emp.minHours ? "under" : "ok"
    return {
      employeeId: emp.id,
      name: emp.name,
      minHours: emp.minHours,
      maxHours: emp.maxHours,
      assignedHours: assigned,
      status,
      bindingMax,
      approaching: bindingMax.hours > 0 && assigned >= 0.8 * bindingMax.hours,
      ...(emp.isWerkstudent
        ? {
            weeksOverBudget: {
              used: budgetByEmployee[emp.id] ?? 0,
              budget: rules.werkstudent.maxWeeksOverPerYear,
            },
          }
        : {}),
    }
  })
}

export async function getNoShowHistory(locationId: string): Promise<EmployeeNoShows[]> {
  const since = weekStart(8)
  // Real no-show events (missed check-ins), not the old declined-shift proxy.
  const declined = await prisma.shift.findMany({
    where: {
      schedule: { locationId, weekStart: { gte: since } },
      status: "NO_SHOW",
      employeeId: { not: null },
    },
    include: { employee: { select: { id: true, name: true } } },
  })

  const map = new Map<string, { name: string; count: number }>()
  for (const s of declined) {
    if (!s.employee) continue
    const entry = map.get(s.employeeId!) ?? { name: s.employee.name, count: 0 }
    entry.count++
    map.set(s.employeeId!, entry)
  }

  return Array.from(map.entries()).map(([employeeId, { name, count }]) => ({
    employeeId,
    name,
    count,
  }))
}

// Rollup: aggregate acceptance rate across all locations for an owner
export async function getRollupAcceptanceRate(
  ownerId: string
): Promise<{ locationName: string; rate: number; accepted: number; total: number }[]> {
  const since = weekStart(8)
  const locations = await prisma.location.findMany({
    where: { ownerId },
    include: {
      schedules: {
        where: { weekStart: { gte: since } },
        include: {
          shifts: {
            where: { employeeId: { not: null } },
            select: { status: true },
          },
        },
      },
    },
  })

  return locations.map((loc) => {
    let accepted = 0
    let total = 0
    for (const sched of loc.schedules) {
      for (const shift of sched.shifts) {
        total++
        if (shift.status === "ACCEPTED" || shift.status === "REASSIGNED") accepted++
      }
    }
    return {
      locationName: loc.name,
      accepted,
      total,
      rate: total > 0 ? Math.round((accepted / total) * 100) : 0,
    }
  })
}

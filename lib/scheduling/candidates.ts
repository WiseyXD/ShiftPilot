// Replacement-candidate building: rank a location's employees for a shift that
// needs cover, then drop everyone working-time law forbids. DB boundary (reads
// employees/rules/hours/blocks/vacations, writes one COMPLIANCE_BLOCKED audit
// row) — the pure ranking itself lives in lib/scheduling/replacement.ts.
//
// Two callers, two latency worlds:
//   • lib/inngest/outreach-loop.ts wraps this in a single step.run for the
//     durable replacement/swap workflows.
//   • lib/whatsapp-sim/handler.ts calls it DIRECTLY when an employee calls in
//     sick from chat — the cover ask must land on the next phone in seconds,
//     and in production each Inngest step round trip was costing minutes.

import { prisma } from "@/prisma/client"
import { rankReplacementCandidates } from "@/lib/scheduling/replacement"
import { getShiftStart, getShiftEnd } from "@/lib/scheduling/shift-date"
import {
  checkEmployeeAssignment,
  type ComplianceViolation,
  type PlannedShift,
} from "@/lib/compliance/check"
import { loadRules } from "@/lib/compliance/load"
import { loadMonthNetHoursBeforeWeek } from "@/lib/compliance/hours"
import { isBlocked } from "@/lib/scheduling/pins"
import { isOnVacation } from "@/lib/scheduling/vacation"

export interface OutreachCandidate {
  employeeId: string
  email: string
  name: string
  priority: number
  fairnessScore: number
}

export interface ShiftForCandidates {
  dayOfWeek: number
  shiftTemplateId: string
  shiftTemplate: { requiredRoles: string[]; startTime: string; endTime: string }
  schedule: {
    weekStart: Date | string
    shifts: Array<{
      employeeId: string | null
      dayOfWeek: number
      status: string
      shiftTemplate: { startTime: string; endTime: string }
    }>
  }
}

export async function computeShiftCandidates(opts: {
  locationId: string
  shift: ShiftForCandidates
  // Employee to exclude from candidates (the declined employee or swap requester)
  excludeEmployeeId: string
}): Promise<OutreachCandidate[]> {
  const { locationId, shift, excludeEmployeeId } = opts

  const employees = await prisma.employee.findMany({
    where: { locationId },
    include: { recurringAvailability: true },
  })

  const hoursMap: Record<string, number> = {}
  for (const s of shift.schedule.shifts) {
    if (s.employeeId && s.status !== "DECLINED") {
      const h = shiftDurationHours(s.shiftTemplate.startTime, s.shiftTemplate.endTime)
      hoursMap[s.employeeId] = (hoursMap[s.employeeId] ?? 0) + h
    }
  }

  const ranked = rankReplacementCandidates(
    employees.map((emp) => ({
      id: emp.id,
      name: emp.name,
      roles: emp.roles,
      minHours: emp.minHours,
      maxHours: emp.maxHours,
      assignedHoursThisWeek: hoursMap[emp.id] ?? 0,
      hasVolunteeredForExtra: false,
    })),
    {
      requiredRoles: shift.shiftTemplate.requiredRoles,
      durationHours: shiftDurationHours(shift.shiftTemplate.startTime, shift.shiftTemplate.endTime),
      dayOfWeek: shift.dayOfWeek,
    },
    employees.flatMap((emp) =>
      emp.recurringAvailability.map((a) => ({
        employeeId: emp.id,
        dayOfWeek: a.dayOfWeek,
        available: true,
      }))
    ),
    excludeEmployeeId
  )

  // Hydrate each ranked candidate with the employee's email + name so callers
  // don't need to look them up again. Preserves the priority order.
  const hydrated: OutreachCandidate[] = []
  for (const r of ranked) {
    const emp = employees.find((e) => e.id === r.employeeId)
    if (!emp) continue
    hydrated.push({
      employeeId: r.employeeId,
      email: emp.email,
      name: emp.name,
      priority: r.priority,
      fairnessScore: r.fairnessScore,
    })
  }

  // Legal filter — a candidate whose acceptance would break working-time law
  // (ArbZG, or JArbSchG for minors) is never contacted, and the exclusion is
  // explained in the audit log.
  const rules = await loadRules(new Date())
  const weekStart = new Date(shift.schedule.weekStart)
  const monthHours = await loadMonthNetHoursBeforeWeek(
    hydrated.map((c) => c.employeeId),
    weekStart,
    rules.arbzg
  )
  const blocks = await prisma.blockedTime.findMany({ where: { locationId } })
  const vacations = await prisma.vacation.findMany({ where: { locationId } })
  const candidateSlot: PlannedShift = {
    start: getShiftStart(weekStart, shift.dayOfWeek, shift.shiftTemplate.startTime),
    end: getShiftEnd(weekStart, shift.dayOfWeek, shift.shiftTemplate.endTime),
  }

  const legal: OutreachCandidate[] = []
  const blocked: { candidate: OutreachCandidate; violation: ComplianceViolation }[] = []
  for (const candidate of hydrated) {
    // Sperrzeit: this employee never works this slot — hard exclusion.
    if (isBlocked(blocks, candidate.employeeId, shift.shiftTemplateId, shift.dayOfWeek)) continue
    // On vacation on the shift's real date — never asked.
    if (isOnVacation(vacations, candidate.employeeId, candidateSlot.start)) continue
    const emp = employees.find((e) => e.id === candidate.employeeId)
    const existing: PlannedShift[] = shift.schedule.shifts
      .filter((s) => s.employeeId === candidate.employeeId && s.status !== "DECLINED")
      .map((s) => ({
        start: getShiftStart(weekStart, s.dayOfWeek, s.shiftTemplate.startTime),
        end: getShiftEnd(weekStart, s.dayOfWeek, s.shiftTemplate.endTime),
      }))
    const violation = checkEmployeeAssignment(
      {
        birthDate: emp?.birthDate ?? null,
        category: emp?.category,
        hourlyWageCents: emp?.hourlyWageCents,
        isWerkstudent: emp?.isWerkstudent,
        lectureFree: emp?.lectureFree,
      },
      candidateSlot,
      existing,
      rules,
      { monthNetHoursBeforeWeek: monthHours[candidate.employeeId] ?? 0 }
    )
    if (violation) blocked.push({ candidate, violation })
    else legal.push(candidate)
  }

  if (blocked.length > 0) {
    await prisma.auditLog.create({
      data: {
        locationId,
        action: "COMPLIANCE_BLOCKED",
        aiReasoning: blocked
          .map((b) => `${b.candidate.name}: ${b.violation.rule} — ${b.violation.detail}`)
          .join("; "),
        candidatesConsidered: blocked.map((b) => ({
          employeeId: b.candidate.employeeId,
          rule: b.violation.rule,
        })),
        outcome: `${blocked.length} candidate(s) excluded by working-time law`,
      },
    })
  }

  return legal
}

export function shiftDurationHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  return (eh * 60 + em - (sh * 60 + sm)) / 60
}

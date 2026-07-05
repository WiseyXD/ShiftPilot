"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { checkEmployeeAssignment } from "@/lib/compliance/check"
import { loadRules } from "@/lib/compliance/load"
import { loadMonthNetHoursBeforeWeek } from "@/lib/compliance/hours"
import { isBlocked } from "@/lib/scheduling/pins"
import { isOnVacation } from "@/lib/scheduling/vacation"
import { isAssignable } from "@/lib/scheduling/categories"
import { getShiftStart, getShiftEnd, formatShiftDate } from "@/lib/scheduling/shift-date"
import { getEffectiveAvailability } from "@/lib/scheduling/availability"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import { revalidatePath } from "next/cache"
import * as React from "react"

export type EditState = { error: string } | { warning: string } | null

// Manual manager edit (concept doc §10): legal limits always block with the
// rule named; softer conflicts warn once and can be overridden.
export async function reassignShift(_prev: EditState, formData: FormData): Promise<EditState> {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }

  const shiftId = formData.get("shiftId") as string
  const targetEmployeeId = ((formData.get("employeeId") as string) ?? "").trim() || null
  const override = formData.get("override") === "1"

  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, schedule: { location: { ownerId: session.user.id } } },
    include: {
      shiftTemplate: true,
      employee: { select: { name: true, email: true } },
      schedule: { include: { location: true } },
    },
  })
  if (!shift) return { error: "Shift not found" }
  if (shift.status === "LENT_OUT") {
    return { error: "This shift is lent out to another venue — resolve the loan first" }
  }

  const location = shift.schedule.location
  const weekStart = new Date(shift.schedule.weekStart)
  const start = getShiftStart(weekStart, shift.dayOfWeek, shift.shiftTemplate.startTime)
  const shiftLabel = `${shift.shiftTemplate.name} on ${formatShiftDate(start)}`

  // Unassign: always allowed — the manager owns the floor risk.
  if (!targetEmployeeId) {
    await prisma.shift.update({
      where: { id: shiftId },
      data: { employeeId: null, status: "UNASSIGNED" },
    })
    await afterEdit(location.id, shiftId, `unassigned (was ${shift.employee?.name ?? "empty"})`)
    if (shift.employee) {
      await notify(
        shift.employee.email,
        `Schedule change: ${shiftLabel}`,
        `Your ${shiftLabel} at ${location.name} was taken off your plan by the manager.`
      )
    }
    revalidatePath(`/dashboard/${location.id}/schedules/${shift.scheduleId}`)
    return null
  }

  const employee = await prisma.employee.findFirst({
    where: { id: targetEmployeeId, locationId: location.id },
    include: { vacations: true },
  })
  if (!employee) return { error: "That employee doesn't belong to this location" }

  // HARD: working-time law — never overridable, rule named.
  const [rules, weekShifts] = await Promise.all([
    loadRules(weekStart),
    prisma.shift.findMany({
      where: {
        employeeId: employee.id,
        scheduleId: shift.scheduleId,
        id: { not: shiftId },
        status: { notIn: ["DECLINED", "UNASSIGNED"] },
      },
      include: { shiftTemplate: { select: { startTime: true, endTime: true } } },
    }),
  ])
  const monthHours = await loadMonthNetHoursBeforeWeek([employee.id], weekStart, rules.arbzg)
  const existing = weekShifts.map((s) => ({
    start: getShiftStart(weekStart, s.dayOfWeek, s.shiftTemplate.startTime),
    end: getShiftEnd(weekStart, s.dayOfWeek, s.shiftTemplate.endTime),
  }))
  const candidate = {
    start,
    end: getShiftEnd(weekStart, shift.dayOfWeek, shift.shiftTemplate.endTime),
  }
  const violation = checkEmployeeAssignment(employee, candidate, existing, rules, {
    monthNetHoursBeforeWeek: monthHours[employee.id] ?? 0,
  })
  if (violation) {
    return { error: `Blocked by ${violation.rule}: ${violation.detail}` }
  }

  // SOFT: warn once, manager may override.
  if (!override) {
    const soft: string[] = []
    const [blocks, pins, availability] = await Promise.all([
      prisma.blockedTime.findMany({ where: { employeeId: employee.id } }),
      prisma.fixedShift.findMany({
        where: {
          shiftTemplateId: shift.shiftTemplateId,
          dayOfWeek: shift.dayOfWeek,
          OR: [{ weekStart: null }, { weekStart }],
        },
        include: { employee: { select: { name: true } } },
      }),
      getEffectiveAvailability(location.id, weekStart),
    ])
    if (isBlocked(blocks, employee.id, shift.shiftTemplateId, shift.dayOfWeek)) {
      soft.push(`${employee.name} has a Sperrzeit here`)
    }
    if (isOnVacation(employee.vacations, employee.id, start)) {
      soft.push(`${employee.name} is on vacation`)
    }
    const hasSlot = availability.some(
      (a) =>
        a.employeeId === employee.id &&
        a.shiftTemplateId === shift.shiftTemplateId &&
        a.dayOfWeek === shift.dayOfWeek &&
        a.available
    )
    if (!isAssignable(employee.category, hasSlot)) {
      soft.push(`${employee.name} is not available for this slot`)
    }
    const foreignPin = pins.find((p) => p.employeeId !== employee.id)
    if (foreignPin) soft.push(`slot is pinned to ${foreignPin.employee.name}`)

    if (soft.length > 0) return { warning: soft.join("; ") }
  }

  const previous = shift.employee
  await prisma.shift.update({
    where: { id: shiftId },
    data: { employeeId: employee.id, status: "REASSIGNED" },
  })
  await afterEdit(
    location.id,
    shiftId,
    `assigned to ${employee.name}${previous ? ` (was ${previous.name})` : ""}${override ? " [override]" : ""}`
  )
  await notify(
    employee.email,
    `New shift: ${shiftLabel}`,
    `The manager scheduled you for the ${shiftLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) at ${location.name}.`
  )
  if (previous && previous.email !== employee.email) {
    await notify(
      previous.email,
      `Schedule change: ${shiftLabel}`,
      `Your ${shiftLabel} at ${location.name} was reassigned to a colleague by the manager.`
    )
  }

  revalidatePath(`/dashboard/${location.id}/schedules/${shift.scheduleId}`)
  return null
}

async function afterEdit(locationId: string, shiftId: string, outcome: string) {
  await prisma.auditLog.create({
    data: {
      locationId,
      action: "MANUAL_EDIT",
      aiReasoning: "",
      candidatesConsidered: [{ shiftId }],
      outcome: `Shift ${shiftId} ${outcome}`,
    },
  })
}

async function notify(to: string, subject: string, body: string) {
  try {
    await sendEmail({
      to,
      subject,
      react: React.createElement(NotificationEmail, { heading: subject, body }),
    })
  } catch (err) {
    console.error("edit notification failed:", err)
  }
}

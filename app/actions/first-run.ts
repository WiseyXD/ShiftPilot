"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { revalidatePath } from "next/cache"

// The guided first-run flow is a scripted show, but it commits real data so the
// dashboard is populated and usable once the manager exits. These actions do the
// two real writes: publish the first week, and apply the sick→cover reassignment.

function nextMonday(from: Date): Date {
  const d = new Date(from)
  const day = d.getDay()
  const diff = day === 1 ? 7 : (8 - day) % 7
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

async function ownedLocation(locationId: string) {
  const session = await auth()
  if (!session) return null
  return prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
    include: {
      employees: { select: { id: true } },
      shiftTemplates: { select: { id: true } },
    },
  })
}

export interface SeedAssignment {
  shiftTemplateId: string
  dayOfWeek: number
  employeeId: string | null
}

// Publish the (manager-edited) first week: a real PUBLISHED schedule + shifts,
// so the board, KPIs and charts light up. Idempotent per week.
export async function publishFirstWeek(locationId: string, assignments: SeedAssignment[]) {
  const location = await ownedLocation(locationId)
  if (!location) return { error: "Not found" }

  const validEmployees = new Set(location.employees.map((e) => e.id))
  const validTemplates = new Set(location.shiftTemplates.map((t) => t.id))
  const clean = assignments.filter(
    (a) => validTemplates.has(a.shiftTemplateId) && (a.employeeId === null || validEmployees.has(a.employeeId))
  )
  if (clean.length === 0) return { error: "No valid assignments to publish" }

  const weekStart = nextMonday(new Date())

  const existing = await prisma.schedule.findFirst({ where: { locationId, weekStart } })
  if (existing) return { scheduleId: existing.id }

  const schedule = await prisma.schedule.create({
    data: {
      locationId,
      weekStart,
      status: "PUBLISHED",
      shifts: {
        create: clean.map((a) => ({
          shiftTemplateId: a.shiftTemplateId,
          employeeId: a.employeeId,
          dayOfWeek: a.dayOfWeek,
          status: a.employeeId ? "ACCEPTED" : "UNASSIGNED",
        })),
      },
    },
  })

  const filled = clean.filter((a) => a.employeeId).length
  await prisma.auditLog.create({
    data: {
      locationId,
      action: "SCHEDULE_GENERATED",
      aiReasoning: "First week created and published via the guided setup.",
      candidatesConsidered: [],
      outcome: `${filled}/${clean.length} shifts filled`,
    },
  })

  revalidatePath(`/dashboard/${locationId}`)
  return { scheduleId: schedule.id }
}

// Apply the sick→cover story to the seeded schedule so the dashboard's audit log
// and board reflect it. Best-effort: never throws the flow.
export async function applyDemoSickReplacement(
  locationId: string,
  scheduleId: string,
  slot: { shiftTemplateId: string; dayOfWeek: number; toEmployeeId: string; sickName: string; coverName: string }
) {
  const location = await ownedLocation(locationId)
  if (!location) return { error: "Not found" }

  try {
    const shift = await prisma.shift.findFirst({
      where: { scheduleId, shiftTemplateId: slot.shiftTemplateId, dayOfWeek: slot.dayOfWeek },
    })
    if (shift) {
      await prisma.shift.update({
        where: { id: shift.id },
        data: { employeeId: slot.toEmployeeId, status: "REASSIGNED" },
      })
    }
    await prisma.auditLog.create({
      data: {
        locationId,
        action: "REPLACEMENT_FOUND",
        aiReasoning: `${slot.sickName} called in sick — Covrly found ${slot.coverName} to cover.`,
        candidatesConsidered: [{ employeeId: slot.toEmployeeId }],
        outcome: "reassigned",
      },
    })
    revalidatePath(`/dashboard/${locationId}`)
    return { ok: true }
  } catch (err) {
    console.error("applyDemoSickReplacement failed (flow continues):", err)
    return { ok: false }
  }
}

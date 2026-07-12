"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { handleEmployeeMessage } from "@/lib/whatsapp-sim/handler"
import { revalidatePath } from "next/cache"

async function ownsEmployee(employeeId: string, ownerId: string) {
  return prisma.employee.findFirst({
    where: { id: employeeId, location: { ownerId } },
  })
}

export async function sendChatMessage(employeeId: string, text: string) {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }
  const trimmed = text.trim()
  if (!trimmed) return { error: "Empty message" }
  if (!(await ownsEmployee(employeeId, session.user.id))) return { error: "Not found" }

  await handleEmployeeMessage(employeeId, trimmed)
  return null
}

export async function clearChatThread(employeeId: string) {
  const session = await auth()
  if (!session) return
  const employee = await ownsEmployee(employeeId, session.user.id)
  if (!employee) return
  await prisma.chatMessage.deleteMany({ where: { employeeId } })
  revalidatePath(`/dashboard/${employee.locationId}/whatsapp`)
}

// Wipe all runtime demo state for a location so the whole flow can be re-run
// from a clean slate. Keeps the standing config (employees, shift templates,
// recurring availability, rules, pins, blocks, vacations); clears everything a
// generate→publish→swap cycle produces. Deleting schedules cascades their
// shifts (and each shift's swap requests); the rest is cleared explicitly.
export async function resetDemo(locationId: string) {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }
  const location = await prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
    include: { employees: { select: { id: true } } },
  })
  if (!location) return { error: "Not found" }
  const employeeIds = location.employees.map((e) => e.id)

  await prisma.$transaction([
    prisma.chatMessage.deleteMany({ where: { locationId } }),
    prisma.schedule.deleteMany({ where: { locationId } }),
    prisma.sickCall.deleteMany({ where: { locationId } }),
    prisma.availabilityConfirmation.deleteMany({ where: { employeeId: { in: employeeIds } } }),
    prisma.availabilityOverride.deleteMany({ where: { employeeId: { in: employeeIds } } }),
    prisma.auditLog.deleteMany({ where: { locationId } }),
  ])

  revalidatePath(`/dashboard/${locationId}/whatsapp`)
  revalidatePath(`/dashboard/${locationId}`)
  return { ok: true }
}

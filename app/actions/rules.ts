"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { revalidatePath } from "next/cache"

type ActionState = { error: string } | null

async function ownedLocation(locationId: string, ownerId: string) {
  return prisma.location.findFirst({ where: { id: locationId, ownerId } })
}

// Monday of the week containing the given date — pins store normalized weeks.
function mondayOf(dateStr: string): Date | null {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const day = d.getDay()
  d.setDate(d.getDate() - ((day + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

export async function createFixedShift(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }

  const locationId = formData.get("locationId") as string
  if (!(await ownedLocation(locationId, session.user.id))) return { error: "Location not found" }

  const employeeId = formData.get("employeeId") as string
  const shiftTemplateId = formData.get("shiftTemplateId") as string
  const dayOfWeek = parseInt(formData.get("dayOfWeek") as string)
  if (!employeeId || !shiftTemplateId || isNaN(dayOfWeek)) return { error: "All fields are required" }

  const scope = formData.get("scope") as string
  let weekStart: Date | null = null
  if (scope === "week") {
    weekStart = mondayOf((formData.get("week") as string) ?? "")
    if (!weekStart) return { error: "Pick a week for a single-week pin" }
  }

  const employee = await prisma.employee.findFirst({ where: { id: employeeId, locationId } })
  if (!employee) return { error: "That employee doesn't belong to this location" }

  // A pin that collides with a Sperrzeit would be silently dropped at
  // generation time — surface the conflict now instead.
  const block = await prisma.blockedTime.findFirst({
    where: {
      employeeId,
      dayOfWeek,
      OR: [{ shiftTemplateId: null }, { shiftTemplateId }],
    },
  })
  if (block) {
    return { error: `${employee.name} has a Sperrzeit on that day — remove it before pinning` }
  }

  await prisma.fixedShift.create({
    data: { locationId, employeeId, shiftTemplateId, dayOfWeek, weekStart },
  })
  revalidatePath(`/dashboard/${locationId}/templates`)
  return null
}

export async function deleteFixedShift(id: string) {
  const session = await auth()
  if (!session) return
  await prisma.fixedShift.deleteMany({
    where: { id, location: { ownerId: session.user.id } },
  })
}

export async function createBlockedTime(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }

  const locationId = formData.get("locationId") as string
  if (!(await ownedLocation(locationId, session.user.id))) return { error: "Location not found" }

  const employeeId = formData.get("employeeId") as string
  const dayOfWeek = parseInt(formData.get("dayOfWeek") as string)
  const shiftTemplateId = ((formData.get("shiftTemplateId") as string) ?? "").trim() || null
  if (!employeeId || isNaN(dayOfWeek)) return { error: "Employee and day are required" }

  const employee = await prisma.employee.findFirst({ where: { id: employeeId, locationId } })
  if (!employee) return { error: "That employee doesn't belong to this location" }

  // Mirror of the pin-side check: don't create a block under an existing pin.
  const pin = await prisma.fixedShift.findFirst({
    where: {
      employeeId,
      dayOfWeek,
      ...(shiftTemplateId ? { shiftTemplateId } : {}),
    },
  })
  if (pin) {
    return { error: `${employee.name} is pinned on that day — remove the pin before blocking` }
  }

  await prisma.blockedTime.create({
    data: { locationId, employeeId, dayOfWeek, shiftTemplateId },
  })
  revalidatePath(`/dashboard/${locationId}/templates`)
  return null
}

export async function deleteBlockedTime(id: string) {
  const session = await auth()
  if (!session) return
  await prisma.blockedTime.deleteMany({
    where: { id, location: { ownerId: session.user.id } },
  })
}
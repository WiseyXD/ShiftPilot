"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { isPro } from "@/lib/plan"
import { revalidatePath } from "next/cache"

type ActionState = { error: string } | null

async function assertOwnsLocation(locationId: string, ownerId: string) {
  const loc = await prisma.location.findFirst({
    where: { id: locationId, ownerId },
  })
  return !!loc
}

export async function createTemplate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }

  const locationId = formData.get("locationId") as string
  const name = (formData.get("name") as string)?.trim()
  const startTime = formData.get("startTime") as string
  const endTime = formData.get("endTime") as string
  const minHeadcount = parseInt(formData.get("minHeadcount") as string) || 1
  const requiredRoles = formData.getAll("requiredRoles") as string[]

  if (!name || !startTime || !endTime) {
    return { error: "Name, start time, and end time are required" }
  }
  if (!(await assertOwnsLocation(locationId, session.user.id))) {
    return { error: "Location not found" }
  }

  await prisma.shiftTemplate.create({
    data: { locationId, name, startTime, endTime, minHeadcount, requiredRoles },
  })

  revalidatePath(`/dashboard/${locationId}/templates`)
  return null
}

export async function deleteTemplate(templateId: string) {
  const session = await auth()
  if (!session) return

  const template = await prisma.shiftTemplate.findFirst({
    where: { id: templateId, location: { ownerId: session.user.id } },
  })
  if (!template) return

  await prisma.shiftTemplate.delete({ where: { id: templateId } })
  revalidatePath(`/dashboard/${template.locationId}/templates`)
}

export async function updateLocationConfig(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }

  const locationId = formData.get("locationId") as string
  const generationDayOfWeek = parseInt(formData.get("generationDayOfWeek") as string)

  if (!(await assertOwnsLocation(locationId, session.user.id))) {
    return { error: "Location not found" }
  }

  const data: Record<string, number> = { generationDayOfWeek }

  // freeze window and escalation timeout are Pro-only
  if (isPro(session.user.stripePlan)) {
    const freezeWindowHours = parseInt(formData.get("freezeWindowHours") as string)
    const escalationTimeoutHours = parseInt(formData.get("escalationTimeoutHours") as string)
    if (!isNaN(freezeWindowHours)) data.freezeWindowHours = freezeWindowHours
    if (!isNaN(escalationTimeoutHours)) data.escalationTimeoutHours = escalationTimeoutHours
  }

  await prisma.location.update({ where: { id: locationId }, data })

  revalidatePath(`/dashboard/${locationId}/templates`)
  return null
}

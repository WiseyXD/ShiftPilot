"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { canAddEmployee } from "@/lib/plan"
import { revalidatePath } from "next/cache"

type ActionState = { error: string } | null

async function assertOwnsLocation(locationId: string, ownerId: string) {
  const loc = await prisma.location.findFirst({
    where: { id: locationId, ownerId },
  })
  return !!loc
}

export async function createEmployee(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }

  const locationId = formData.get("locationId") as string
  const name = (formData.get("name") as string)?.trim()
  const email = (formData.get("email") as string)?.trim().toLowerCase()
  const roles = formData.getAll("roles") as string[]
  const minHours = parseInt(formData.get("minHours") as string) || 0
  const maxHours = parseInt(formData.get("maxHours") as string) || 40

  if (!name || !email) return { error: "Name and email are required" }
  if (minHours > maxHours) return { error: "Min hours cannot exceed max hours" }
  if (!(await assertOwnsLocation(locationId, session.user.id))) {
    return { error: "Location not found" }
  }

  const employeeCount = await prisma.employee.count({ where: { locationId } })
  if (!canAddEmployee(session.user.stripePlan, employeeCount)) {
    return {
      error: `Starter plan is limited to 15 employees per location. Upgrade to Pro to add more.`,
    }
  }

  const existing = await prisma.employee.findUnique({
    where: { locationId_email: { locationId, email } },
  })
  if (existing) return { error: "An employee with this email already exists at this location" }

  await prisma.employee.create({
    data: { locationId, name, email, roles, minHours, maxHours },
  })

  revalidatePath(`/dashboard/${locationId}`)
  return null
}

export async function updateEmployee(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }

  const employeeId = formData.get("employeeId") as string
  const name = (formData.get("name") as string)?.trim()
  const roles = formData.getAll("roles") as string[]
  const minHours = parseInt(formData.get("minHours") as string) || 0
  const maxHours = parseInt(formData.get("maxHours") as string) || 40

  if (!name) return { error: "Name is required" }
  if (minHours > maxHours) return { error: "Min hours cannot exceed max hours" }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, location: { ownerId: session.user.id } },
  })
  if (!employee) return { error: "Employee not found" }

  await prisma.employee.update({
    where: { id: employeeId },
    data: { name, roles, minHours, maxHours },
  })

  revalidatePath(`/dashboard/${employee.locationId}`)
  return null
}

export async function deleteEmployee(employeeId: string) {
  const session = await auth()
  if (!session) return

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, location: { ownerId: session.user.id } },
  })
  if (!employee) return

  await prisma.employee.delete({ where: { id: employeeId } })
  revalidatePath(`/dashboard/${employee.locationId}`)
}

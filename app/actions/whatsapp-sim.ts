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

"use server"

import { prisma } from "@/prisma/client"

type ActionState = { error: string } | null

export async function submitAvailabilityOverride(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tokenId = formData.get("tokenId") as string
  const employeeId = formData.get("employeeId") as string
  const weekStartStr = formData.get("weekStart") as string

  const token = await prisma.actionToken.findUnique({ where: { id: tokenId } })
  if (!token || token.usedAt || token.expiresAt < new Date()) {
    return { error: "This link has expired or already been used." }
  }
  if (token.employeeId !== employeeId) return { error: "Invalid token" }

  const weekStart = new Date(weekStartStr)

  // availableSlots: "shiftTemplateId:date" — the specific date they ARE available
  const availableSlots = formData.getAll("available") as string[]
  // unavailableSlots: "shiftTemplateId:date" — slots they're overriding to unavailable
  const unavailableSlots = formData.getAll("unavailable") as string[]

  const operations = [
    // delete existing overrides for this employee + week range
    prisma.availabilityOverride.deleteMany({
      where: {
        employeeId,
        date: {
          gte: weekStart,
          lt: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    // insert available overrides
    ...availableSlots.map((slot) => {
      const [shiftTemplateId, dateStr] = slot.split("|")
      return prisma.availabilityOverride.create({
        data: { employeeId, shiftTemplateId, date: new Date(dateStr), available: true },
      })
    }),
    // insert unavailable overrides
    ...unavailableSlots.map((slot) => {
      const [shiftTemplateId, dateStr] = slot.split("|")
      return prisma.availabilityOverride.create({
        data: { employeeId, shiftTemplateId, date: new Date(dateStr), available: false },
      })
    }),
    prisma.actionToken.update({ where: { id: tokenId }, data: { usedAt: new Date() } }),
  ]

  await prisma.$transaction(operations)
  return null
}

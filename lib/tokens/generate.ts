import { prisma } from "@/prisma/client"
import type { ActionTokenAction, Prisma } from "@/prisma/generated/client/client"

export async function generateToken(
  employeeId: string,
  action: ActionTokenAction,
  payload: Prisma.InputJsonValue,
  ttlHours: number = 168
) {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)
  return prisma.actionToken.create({
    data: { employeeId, action, payload, expiresAt },
  })
}

export async function generateManagerToken(
  userId: string,
  action: ActionTokenAction,
  payload: Prisma.InputJsonValue,
  ttlHours: number = 48
) {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)
  return prisma.actionToken.create({
    data: { userId, action, payload, expiresAt },
  })
}

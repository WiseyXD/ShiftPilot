"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { handleOwnerMessage } from "@/lib/agent/owner-agent"

async function ownsLocation(locationId: string, ownerId: string) {
  return prisma.location.findFirst({ where: { id: locationId, ownerId }, select: { id: true } })
}

export async function sendOwnerMessage(locationId: string, text: string, pageContext?: string) {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }
  const trimmed = text.trim()
  if (!trimmed) return { error: "Empty message" }
  if (!(await ownsLocation(locationId, session.user.id))) return { error: "Not found" }

  await handleOwnerMessage(session.user.id, locationId, trimmed, pageContext)
  return null
}

export async function clearOwnerThread(locationId: string) {
  const session = await auth()
  if (!session) return
  if (!(await ownsLocation(locationId, session.user.id))) return
  // Messages only — executed AgentActions stay (they're part of the audit story).
  await prisma.chatMessage.deleteMany({ where: { locationId, userId: session.user.id } })
}

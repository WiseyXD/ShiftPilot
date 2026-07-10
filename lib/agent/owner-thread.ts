// The owner's copilot thread — persistence door shared by the chat panel, the
// WhatsApp simulator's owner chat, and the durable workflows that push
// outcomes proactively (replacement found/failed, sick calls, draft ready).
// Kept free of app/actions imports so Inngest functions can import it.

import { prisma } from "@/prisma/client"
import { detectLanguage, DEFAULT_LANG, type Lang } from "./i18n"
import type { ChatAction } from "./types"

// The thread's language: the most recent owner message we can classify wins,
// then the owner's language preference (the sidebar toggle), then English.
// Proactive pushes and button taps (which carry no language) use this.
export async function ownerThreadLanguage(locationId: string, userId?: string): Promise<Lang> {
  let ownerId = userId
  if (!ownerId) {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      select: { ownerId: true },
    })
    if (!location) return DEFAULT_LANG
    ownerId = location.ownerId
  }
  const recent = await prisma.chatMessage.findMany({
    where: { locationId, userId: ownerId, role: "OWNER" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { body: true },
  })
  for (const m of recent) {
    const lang = detectLanguage(m.body)
    if (lang) return lang
  }
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { language: true },
  })
  return user?.language === "de" ? "de" : DEFAULT_LANG
}

export async function pushOwnerMessage(
  locationId: string,
  body: string,
  actions?: ChatAction[]
) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { ownerId: true },
  })
  if (!location) return
  await prisma.chatMessage.create({
    data: {
      locationId,
      userId: location.ownerId,
      role: "AGENT",
      body,
      actions: actions ? (actions as unknown as object[]) : undefined,
    },
  })
}

export async function recordOwnerMessage(locationId: string, userId: string, body: string) {
  await prisma.chatMessage.create({
    data: { locationId, userId, role: "OWNER", body },
  })
}

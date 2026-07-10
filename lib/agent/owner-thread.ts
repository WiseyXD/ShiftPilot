// The owner's copilot thread — persistence door shared by the chat panel, the
// WhatsApp simulator's owner chat, and the durable workflows that push
// outcomes proactively (replacement found/failed, sick calls, draft ready).
// Kept free of app/actions imports so Inngest functions can import it.

import { prisma } from "@/prisma/client"
import type { ChatAction } from "./types"

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

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/prisma/client"

// Owner-thread poll: the chat panel and the WhatsApp simulator's owner chat
// both fetch this so proactive copilot messages (replacement found, draft
// ready, sick calls) appear live.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { locationId } = await params
  const location = await prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
    select: { id: true },
  })
  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const messages = await prisma.chatMessage.findMany({
    where: { locationId, userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, body: true, actions: true, createdAt: true },
  })

  return NextResponse.json({ messages })
}

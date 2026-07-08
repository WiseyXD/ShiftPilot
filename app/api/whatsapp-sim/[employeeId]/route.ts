import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/prisma/client"

// Thread poll: the simulator's chat pane fetches this every few seconds so
// proactive agent messages (schedule approval, cover requests) appear live.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { employeeId } = await params
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, location: { ownerId: session.user.id } },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const messages = await prisma.chatMessage.findMany({
    where: { employeeId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, body: true, actions: true, createdAt: true },
  })

  return NextResponse.json({ messages })
}

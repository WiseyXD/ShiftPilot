import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/prisma/client"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { locationId } = await params

  const location = await prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
  })
  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const employees = await prisma.employee.findMany({
    where: { locationId },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({ employees })
}

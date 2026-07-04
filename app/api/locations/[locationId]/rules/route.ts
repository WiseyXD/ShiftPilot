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
    include: {
      employees: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      shiftTemplates: { select: { id: true, name: true }, orderBy: { startTime: "asc" } },
      fixedShifts: {
        include: { employee: { select: { name: true } }, shiftTemplate: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      blockedTimes: {
        include: { employee: { select: { name: true } }, shiftTemplate: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  })
  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    employees: location.employees,
    templates: location.shiftTemplates,
    pins: location.fixedShifts,
    blocks: location.blockedTimes,
  })
}

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { isPro } from "@/lib/plan"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { locationId } = await params

  const location = await prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
    include: { shiftTemplates: { orderBy: { startTime: "asc" } } },
  })
  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    templates: location.shiftTemplates,
    config: {
      generationDayOfWeek: location.generationDayOfWeek,
      freezeWindowHours: location.freezeWindowHours,
      escalationTimeoutHours: location.escalationTimeoutHours,
      checkInGraceMinutes: location.checkInGraceMinutes,
      isPro: isPro(session.user.stripePlan),
    },
  })
}

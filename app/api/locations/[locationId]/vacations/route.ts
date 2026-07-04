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
      vacations: {
        where: { endDate: { gte: new Date() } }, // current + upcoming only
        include: { employee: { select: { name: true } } },
        orderBy: { startDate: "asc" },
      },
    },
  })
  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ employees: location.employees, vacations: location.vacations })
}

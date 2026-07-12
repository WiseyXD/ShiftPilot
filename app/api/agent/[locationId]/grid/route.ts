import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/prisma/client"

// Schedule grid for a week — fed to the chat's inline grid after an edit.
function currentMonday(): Date {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { locationId } = await params
  const offset = Math.max(-1, Math.min(1, parseInt(req.nextUrl.searchParams.get("week") ?? "0") || 0))

  const location = await prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
    include: { shiftTemplates: { orderBy: { startTime: "asc" }, select: { id: true, name: true, startTime: true, endTime: true } } },
  })
  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const weekStart = new Date(currentMonday().getTime() + offset * 7 * 86400000)
  const weekEnd = new Date(weekStart.getTime() + 6 * 86400000)

  const schedule = await prisma.schedule.findFirst({
    where: { locationId, weekStart },
    orderBy: { createdAt: "desc" },
    include: {
      shifts: {
        select: {
          dayOfWeek: true,
          status: true,
          shiftTemplateId: true,
          employee: { select: { name: true, category: true } },
        },
      },
    },
  })

  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })

  return NextResponse.json({
    weekLabel: offset === -1 ? "Last week" : offset === 1 ? "Next week" : "This week",
    range: `${fmt(weekStart)} – ${fmt(weekEnd)}`,
    weekStart: weekStart.toISOString(),
    status: schedule?.status ?? null,
    templates: location.shiftTemplates,
    shifts: (schedule?.shifts ?? []).map((s) => ({
      dayOfWeek: s.dayOfWeek,
      templateId: s.shiftTemplateId,
      status: s.status,
      employeeName: s.employee?.name ?? null,
      category: s.employee?.category ?? null,
    })),
  })
}

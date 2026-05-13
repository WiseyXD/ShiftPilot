import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { isPro } from "@/lib/plan"
import {
  getAcceptanceRateTrend,
  getReplacementRateTrend,
  getHoursDistribution,
  getNoShowHistory,
} from "@/lib/analytics/kpis"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const { locationId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const location = await prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
    include: { owner: { select: { stripePlan: true } } },
  })
  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!isPro(location.owner.stripePlan)) {
    return NextResponse.json({ error: "Pro plan required" }, { status: 403 })
  }

  const selectedWeek = (() => {
    const d = new Date()
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    d.setHours(0, 0, 0, 0)
    return d
  })()

  const [acceptance, replacement, hours, noShows] = await Promise.all([
    getAcceptanceRateTrend(locationId),
    getReplacementRateTrend(locationId),
    getHoursDistribution(locationId, selectedWeek),
    getNoShowHistory(locationId),
  ])

  const sections: string[] = []

  sections.push("# Acceptance Rate (8 weeks)")
  sections.push("Week,Accepted,Total,Rate%")
  sections.push(...acceptance.map((r) => `${r.weekStart},${r.accepted},${r.total},${r.rate}`))

  sections.push("")
  sections.push("# Replacement Outcomes (8 weeks)")
  sections.push("Week,Resolved,Escalated")
  sections.push(...replacement.map((r) => `${r.weekStart},${r.resolved},${r.escalated}`))

  sections.push("")
  sections.push("# Hours Distribution (current week)")
  sections.push("Employee,MinHours,AssignedHours,MaxHours,Status")
  sections.push(...hours.map((r) => `"${r.name}",${r.minHours},${r.assignedHours.toFixed(1)},${r.maxHours},${r.status}`))

  sections.push("")
  sections.push("# No-show History (8 weeks)")
  sections.push("Employee,DeclinedShifts")
  sections.push(...noShows.map((r) => `"${r.name}",${r.count}`))

  const csv = sections.join("\n")
  const filename = `${location.name.replace(/[^a-z0-9]/gi, "_")}_analytics_${new Date().toISOString().slice(0, 10)}.csv`

  return new Response(csv, {
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  })
}

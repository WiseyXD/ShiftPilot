import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { redirect, notFound } from "next/navigation"
import { LiveDemo } from "@/components/dashboard/live-demo"

// A self-contained, demo-day "watch it happen" screen: click Generate and the
// whole loop plays out on one page — Covrly asks the team, replies come in, the
// draft builds, and next week's schedule scrolls into view. Seeded with the
// café's real staff and shifts so it looks authentic; the animation is scripted
// client-side (no backend calls) so it never stalls on stage.
export default async function LivePage({
  params,
}: {
  params: Promise<{ locationId: string }>
}) {
  const { locationId } = await params
  const session = await auth()
  if (!session) redirect("/login")

  const location = await prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
    include: {
      employees: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, roles: true, category: true },
      },
      shiftTemplates: {
        orderBy: { startTime: "asc" },
        select: { id: true, name: true, startTime: true, endTime: true, minHeadcount: true },
      },
    },
  })
  if (!location) notFound()

  return (
    <LiveDemo
      locationId={location.id}
      locationName={location.name}
      employees={location.employees}
      templates={location.shiftTemplates}
    />
  )
}

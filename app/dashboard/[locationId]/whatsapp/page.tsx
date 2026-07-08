import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { redirect, notFound } from "next/navigation"
import { PageHeader } from "@/components/dashboard/page-header"
import { WhatsAppSimulator } from "@/components/whatsapp/simulator"

export default async function WhatsAppPage({
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
        select: { id: true, name: true, roles: true, category: true, phone: true },
      },
    },
  })
  if (!location) notFound()

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp"
        description="How your team actually talks to ShiftPilot — try it as one of your staff."
      />
      <WhatsAppSimulator locationName={location.name} employees={location.employees} />
    </div>
  )
}

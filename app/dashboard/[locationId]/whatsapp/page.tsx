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

  const [location, dbUser] = await Promise.all([
    prisma.location.findFirst({
      where: { id: locationId, ownerId: session.user.id },
      include: {
        employees: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, roles: true, category: true, phone: true },
        },
      },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { language: true } }),
  ])
  if (!location) notFound()

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp"
        description="How your team actually talks to Covrly — try it as one of your staff."
      />
      <WhatsAppSimulator
        locationId={location.id}
        locationName={location.name}
        employees={location.employees}
        ownerLang={dbUser?.language === "de" ? "de" : "en"}
      />
    </div>
  )
}

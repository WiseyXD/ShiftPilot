import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { redirect, notFound } from "next/navigation"
import { PageHeader } from "@/components/dashboard/page-header"
import { getUserLang } from "@/lib/i18n/server"
import { ui } from "@/lib/i18n/dashboard"
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

  const tp = ui(await getUserLang()).pages
  return (
    <div className="space-y-6">
      <PageHeader
        title={tp.whatsappTitle}
        description={tp.whatsappDesc}
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

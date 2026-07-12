import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { redirect, notFound } from "next/navigation"
import { PageHeader } from "@/components/dashboard/page-header"
import { AssistantChat } from "@/components/agent/assistant-chat"

// Full-page Covrly Assistant — the manager's do-anything copilot. Same brain and
// thread as the floating panel; when it edits a week it renders the grid inline.
export default async function AssistantPage({
  params,
}: {
  params: Promise<{ locationId: string }>
}) {
  const { locationId } = await params
  const session = await auth()
  if (!session) redirect("/login")

  const location = await prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
    select: { id: true, name: true },
  })
  if (!location) notFound()

  return (
    <div className="space-y-6">
      <PageHeader title="Assistant" description="Ask Covrly to run your schedule — reads, edits, publishes, and shows you the grid." />
      <AssistantChat locationId={location.id} locationName={location.name} />
    </div>
  )
}

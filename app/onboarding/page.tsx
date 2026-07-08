import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { redirect } from "next/navigation"
import { OnboardingWizard } from "@/components/onboarding/wizard"

// First-run setup, deliberately outside the dashboard shell for a focused,
// distraction-free experience. Only reachable until the first café exists.
export default async function OnboardingPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const count = await prisma.location.count({ where: { ownerId: session.user.id } })
  if (count > 0) redirect("/dashboard")

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <OnboardingWizard />
    </div>
  )
}

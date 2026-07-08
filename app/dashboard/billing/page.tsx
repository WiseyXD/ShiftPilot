import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/prisma/client"
import { createCheckoutSession, createPortalSession } from "@/app/actions/billing"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    TRIAL: "bg-blue-100 text-blue-700",
    STARTER: "bg-slate-100 text-slate-700",
    PRO: "bg-purple-100 text-purple-700",
    NONE: "bg-red-100 text-red-700",
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[plan] ?? ""}`}>
      {plan}
    </span>
  )
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) redirect("/login")

  const params = await searchParams
  const justSubscribed = params.success === "1"

  const trialDaysLeft =
    user.stripePlan === "TRIAL"
      ? Math.max(0, Math.ceil((user.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Billing</h1>

      {justSubscribed && (
        <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3 text-sm text-green-700">
          Subscription activated. Welcome to Covrly!
        </div>
      )}

      {user.stripePlan === "NONE" && (
        <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-700">
          Your subscription is inactive. Choose a plan below to restore access.
        </div>
      )}

      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-3">
          <p className="font-semibold text-slate-900">Current plan</p>
          <PlanBadge plan={user.stripePlan} />
        </div>
        {trialDaysLeft !== null && (
          <p className="text-sm text-slate-500">
            {trialDaysLeft > 0
              ? `Trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""}`
              : "Trial expired"}
          </p>
        )}
        {user.stripeCustomerId && (
          <form action={createPortalSession}>
            <Button type="submit" variant="outline" size="sm">
              Manage billing
            </Button>
          </form>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-6 space-y-4">
          <div>
            <p className="font-semibold text-slate-900">Starter</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              $29<span className="text-sm font-normal text-slate-500">/mo</span>
            </p>
          </div>
          <ul className="text-sm text-slate-600 space-y-1.5">
            <li>✓ 1 location</li>
            <li>✓ Up to 15 employees</li>
            <li>✓ AI scheduling</li>
            <li>✓ Replacement engine</li>
            <li>✓ 30-day audit log</li>
          </ul>
          <form action={createCheckoutSession.bind(null, "STARTER")}>
            <Button type="submit" variant="outline" className="w-full">
              {user.stripePlan === "STARTER" ? "Current plan" : "Subscribe"}
            </Button>
          </form>
        </Card>

        <Card className="p-6 space-y-4 border-purple-200">
          <div>
            <p className="font-semibold text-slate-900">Pro</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              $79<span className="text-sm font-normal text-slate-500">/mo</span>
            </p>
          </div>
          <ul className="text-sm text-slate-600 space-y-1.5">
            <li>✓ Unlimited locations</li>
            <li>✓ Unlimited employees</li>
            <li>✓ Configurable freeze window</li>
            <li>✓ Full audit history</li>
            <li>✓ Analytics export</li>
          </ul>
          <form action={createCheckoutSession.bind(null, "PRO")}>
            <Button type="submit" className="w-full">
              {user.stripePlan === "PRO" ? "Current plan" : "Subscribe"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}

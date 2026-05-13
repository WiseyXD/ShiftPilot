import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/dashboard/page-header"
import { isPro } from "@/lib/plan"
import { Building2, ChevronRight, Plus, Sparkles, Users } from "lucide-react"

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const locations = await prisma.location.findMany({
    where: { ownerId: session.user.id },
    include: { _count: { select: { employees: true, schedules: true } } },
    orderBy: { createdAt: "asc" },
  })

  if (locations.length === 1) redirect(`/dashboard/${locations[0].id}`)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your locations"
        description={`Manage scheduling across ${locations.length || "all your"} location${locations.length === 1 ? "" : "s"}`}
        action={
          <Link href="/dashboard/locations/new">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add location
            </Button>
          </Link>
        }
      />

      {locations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center text-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <Building2 className="h-7 w-7 text-slate-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">No locations yet</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md">
                Try the demo to see the full flow — real emails, AI scheduling, and the replacement engine in action.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <Link href="/dashboard/demo">
                <Button>
                  <Sparkles className="h-4 w-4" />
                  Try the demo
                </Button>
              </Link>
              <Link href="/dashboard/locations/new">
                <Button variant="outline">Add real location</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {locations.map((loc) => (
            <Link key={loc.id} href={`/dashboard/${loc.id}`} className="group">
              <Card className="hover:border-slate-300 hover:shadow-sm transition-all h-full">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{loc.name}</CardTitle>
                      <CardDescription className="mt-1">{loc.timezone}</CardDescription>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-slate-400" />
                      <span>
                        {loc._count.employees} employee{loc._count.employees !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500">
                      {loc._count.schedules} schedule{loc._count.schedules !== 1 ? "s" : ""}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {!isPro(session.user.stripePlan) && (
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Badge variant="secondary">Starter</Badge>
              <p className="text-sm text-slate-600">
                You're on the Starter plan — 1 location, up to 15 employees.
              </p>
            </div>
            <Link href="/dashboard/billing">
              <Button size="sm" variant="outline">
                Upgrade to Pro
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { isPro } from "@/lib/plan"
import {
  getAcceptanceRateTrend,
  getReplacementRateTrend,
  getHoursDistribution,
  getNoShowHistory,
  getRollupAcceptanceRate,
} from "@/lib/analytics/kpis"
import { AcceptanceTrend } from "./acceptance-trend"
import { ReplacementChart } from "./replacement-chart"
import { HoursTable } from "./hours-table"
import { NoShowTable } from "./no-show-table"
import { RollupTable } from "./rollup-table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/dashboard/page-header"
import { getUserLang } from "@/lib/i18n/server"
import { ui } from "@/lib/i18n/dashboard"
import { Download } from "lucide-react"

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string }>
  searchParams: Promise<{ week?: string }>
}) {
  const { locationId } = await params
  const sp = await searchParams
  const session = await auth()
  if (!session) redirect("/login")

  const location = await prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
    include: { owner: { select: { stripePlan: true } } },
  })
  if (!location) notFound()

  const pro = isPro(location.owner.stripePlan)

  // Default week = current Monday
  const selectedWeek = sp.week ? new Date(sp.week) : (() => {
    const d = new Date()
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    d.setHours(0, 0, 0, 0)
    return d
  })()

  const [acceptance, replacement, hours, noShows, rollup] = await Promise.all([
    getAcceptanceRateTrend(locationId),
    getReplacementRateTrend(locationId),
    getHoursDistribution(locationId, selectedWeek),
    getNoShowHistory(locationId),
    pro ? getRollupAcceptanceRate(session.user.id) : Promise.resolve(null),
  ])

  const tp = ui(await getUserLang()).pages
  return (
    <div className="space-y-6">
      <PageHeader
        title={tp.analyticsTitle}
        description={location.name}
        action={
          pro ? (
            <a href={`/dashboard/${locationId}/analytics/export`}>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </a>
          ) : undefined
        }
      />

      {/* Week selector */}
      <Card>
        <CardContent className="py-4">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Week (hours view)</label>
              <input
                type="date"
                name="week"
                defaultValue={selectedWeek.toISOString().slice(0, 10)}
                className="border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-800"
              />
            </div>
            <Button type="submit" size="sm">Apply</Button>
          </form>
        </CardContent>
      </Card>

      {/* KPI 1 — Acceptance rate */}
      <Card>
        <CardHeader>
          <CardTitle>Acceptance rate</CardTitle>
          <CardDescription>Past 8 weeks</CardDescription>
        </CardHeader>
        <CardContent>
          {acceptance.length === 0 ? (
            <EmptyBlock message="No shift data yet. Acceptance rates will appear once shifts are assigned and actioned." />
          ) : (
            <AcceptanceTrend data={acceptance} />
          )}
        </CardContent>
      </Card>

      {/* KPI 2 — Replacement outcomes */}
      <Card>
        <CardHeader>
          <CardTitle>Replacement outcomes</CardTitle>
          <CardDescription>Resolved = candidate accepted · Escalated = all candidates exhausted</CardDescription>
        </CardHeader>
        <CardContent>
          {replacement.length === 0 ? (
            <EmptyBlock message="No replacement events yet." />
          ) : (
            <ReplacementChart data={replacement} />
          )}
        </CardContent>
      </Card>

      {/* KPI 3 — Hours distribution */}
      <Card>
        <CardHeader>
          <CardTitle>
            Hours distribution — w/c {selectedWeek.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </CardTitle>
          <CardDescription>Over/under-contracted employees are highlighted</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {hours.length === 0 ? (
            <EmptyBlock message="No employees or no schedule for this week." />
          ) : (
            <HoursTable data={hours} />
          )}
        </CardContent>
      </Card>

      {/* KPI 4 — No-show history */}
      <Card>
        <CardHeader>
          <CardTitle>No-show history</CardTitle>
          <CardDescription>Declined shifts per employee over the past 8 weeks</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {noShows.length === 0 ? (
            <EmptyBlock message="No declined shifts recorded in the past 8 weeks." />
          ) : (
            <NoShowTable data={noShows} />
          )}
        </CardContent>
      </Card>

      {/* Pro rollup */}
      {pro && rollup && (
        <Card>
          <CardHeader>
            <CardTitle>All locations — acceptance rate</CardTitle>
            <CardDescription>Cross-location comparison (Pro)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <RollupTable data={rollup} />
          </CardContent>
        </Card>
      )}

      {!pro && (
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="py-4 flex items-center justify-between text-sm text-slate-600">
            <span>Cross-location rollup and CSV export are Pro features.</span>
            <Link href="/dashboard/billing">
              <Button size="sm" variant="outline" className="bg-white">Upgrade to Pro</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-sm text-slate-400">{message}</div>
  )
}

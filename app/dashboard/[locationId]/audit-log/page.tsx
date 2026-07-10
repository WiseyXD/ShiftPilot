import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { isPro } from "@/lib/plan"
import { AuditLogEntry } from "./entry"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/dashboard/page-header"
import { getUserLang } from "@/lib/i18n/server"
import { ui } from "@/lib/i18n/dashboard"
import { Activity } from "lucide-react"

const PAGE_SIZE = 20

const ACTION_LABELS: Record<string, string> = {
  SCHEDULE_GENERATED: "Schedule generated",
  SHIFT_ACCEPTED: "Shift accepted",
  SHIFT_DECLINED: "Shift declined",
  REPLACEMENT_OUTREACH: "Replacement outreach",
  ESCALATED_TO_MANAGER: "Escalated to manager",
  SWAP_OUTREACH: "Swap outreach",
  SWAP_AUTO_APPROVED: "Swap auto-approved",
  SWAP_MANAGER_APPROVAL_REQUESTED: "Swap: manager approval requested",
  SWAP_MANAGER_APPROVED: "Swap: manager approved",
  SWAP_MANAGER_REJECTED: "Swap: manager rejected",
  SWAP_FAILED: "Swap failed",
}

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string }>
  searchParams: Promise<{ page?: string; action?: string; from?: string; to?: string }>
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
  const page = Math.max(1, parseInt(sp.page ?? "1", 10))
  const actionFilter = sp.action || undefined
  const fromDate = sp.from ? new Date(sp.from) : undefined
  const toDate = sp.to ? new Date(sp.to + "T23:59:59") : undefined

  // Starter plan: cap history at 30 days
  const historyFloor = pro
    ? undefined
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const where = {
    locationId,
    ...(actionFilter && { action: actionFilter }),
    createdAt: {
      ...(fromDate && { gte: fromDate }),
      ...(toDate && { lte: toDate }),
      ...(historyFloor && { gte: historyFloor }),
    },
  }

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const actionTypes = Object.keys(ACTION_LABELS)

  function pageUrl(p: number) {
    const params = new URLSearchParams({
      page: String(p),
      ...(actionFilter && { action: actionFilter }),
      ...(sp.from && { from: sp.from }),
      ...(sp.to && { to: sp.to }),
    })
    return `?${params}`
  }

  const tp = ui(await getUserLang()).pages
  return (
    <div className="space-y-6">
      <PageHeader title={tp.auditTitle} description={tp.auditDesc(location.name)} />

      {!pro && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="py-3 flex items-center justify-between text-sm text-amber-900">
            <span>Starter plan shows the last 30 days only.</span>
            <Link href="/dashboard/billing">
              <Button size="sm" variant="outline" className="bg-white">
                Upgrade to Pro
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <form method="GET" className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Action type</label>
              <select
                name="action"
                defaultValue={actionFilter ?? ""}
                className="border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-800 bg-white min-w-[200px]"
              >
                <option value="">All actions</option>
                {actionTypes.map((a) => (
                  <option key={a} value={a}>
                    {ACTION_LABELS[a]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">From</label>
              <input
                type="date"
                name="from"
                defaultValue={sp.from ?? ""}
                className="border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-800"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">To</label>
              <input
                type="date"
                name="to"
                defaultValue={sp.to ?? ""}
                className="border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-800"
              />
            </div>
            <Button type="submit" size="sm">Filter</Button>
            {(actionFilter || sp.from || sp.to) && (
              <Link href="?">
                <Button type="button" size="sm" variant="ghost">Clear</Button>
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Entry list */}
      {entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center text-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Activity className="h-6 w-6 text-slate-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">No entries yet</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md">
                AI decisions will appear here once schedules are generated and shifts are managed.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <AuditLogEntry
              key={entry.id}
              action={entry.action}
              actionLabel={ACTION_LABELS[entry.action] ?? entry.action}
              aiReasoning={entry.aiReasoning}
              candidatesConsidered={entry.candidatesConsidered}
              outcome={entry.outcome}
              createdAt={entry.createdAt}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageUrl(page - 1)}>
                <Button variant="outline" size="sm">Previous</Button>
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageUrl(page + 1)}>
                <Button variant="outline" size="sm">Next</Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

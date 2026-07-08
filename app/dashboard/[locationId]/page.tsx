import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/dashboard/page-header"
import { confirmSickCall } from "@/app/actions/sick"
import { getShiftStart, formatShiftDate } from "@/lib/scheduling/shift-date"
import { getHoursDistribution } from "@/lib/analytics/kpis"
import { RulesCard } from "@/components/dashboard/rules-card"
import { Users, ClipboardList, Calendar, ChevronRight, ArrowRight, Siren, TriangleAlert, CheckCircle2, Circle } from "lucide-react"
import { Covrly } from "@/components/covrly"

const currentMonday = () => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

export default async function LocationPage({
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
      employees: { orderBy: { createdAt: "asc" } },
      shiftTemplates: { orderBy: { startTime: "asc" } },
      schedules: { orderBy: { weekStart: "desc" }, take: 5 },
    },
  })
  if (!location) notFound()

  // Unconfirmed sick calls demand a loud, persistent banner.
  const openSickCalls = await prisma.sickCall.findMany({
    where: { locationId, confirmedAt: null },
    orderBy: { reportedAt: "desc" },
  })
  const sickDetails = await Promise.all(
    openSickCalls.map(async (call) => {
      const [employee, shift] = await Promise.all([
        prisma.employee.findUnique({ where: { id: call.employeeId }, select: { name: true } }),
        prisma.shift.findUnique({
          where: { id: call.shiftId },
          include: { shiftTemplate: true, schedule: { select: { weekStart: true } } },
        }),
      ])
      const label = shift
        ? `${shift.shiftTemplate.name} on ${formatShiftDate(
            getShiftStart(new Date(shift.schedule.weekStart), shift.dayOfWeek, shift.shiftTemplate.startTime)
          )}`
        : "unknown shift"
      return { id: call.id, employeeName: employee?.name ?? "Unknown", label }
    })
  )

  const managerRules = await prisma.managerRule.findMany({
    where: { locationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, plain: true, sourceText: true },
  })

  // Hours warnings for the current week — early, before anything is blocked.
  const hoursReport = await getHoursDistribution(locationId, currentMonday())
  const hoursAlerts = hoursReport.filter(
    (r) => r.status !== "ok" || r.approaching || (r.assignedHours > 0 && r.bindingMax.hours === 0)
  )

  return (
    <div className="space-y-6">
      <PageHeader title={location.name} description={location.timezone} />

      {location.schedules.length === 0 && (() => {
        const steps = [
          { done: location.shiftTemplates.length > 0, label: "Define your shifts", href: `/dashboard/${locationId}/templates` },
          { done: location.employees.length > 0, label: "Add your team", href: `/dashboard/${locationId}/employees` },
          {
            done: false,
            label: `Covrly drafts your first week automatically on ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][location.generationDayOfWeek]}`,
            href: `/dashboard/${locationId}/schedules`,
          },
          { done: false, label: "See how your team chats with Covrly", href: `/dashboard/${locationId}/whatsapp` },
        ]
        const doneCount = steps.filter((s) => s.done).length
        return (
          <Card className="border-primary/20 bg-primary/[0.04]">
            <CardContent className="flex items-start gap-4 py-5">
              <Covrly size={64} wave className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-medium text-foreground">
                  Let&apos;s get {location.name} running
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {doneCount} of {steps.length} done — a couple more and you&apos;re set.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {steps.map((s) => (
                    <li key={s.label}>
                      <Link
                        href={s.href}
                        className="group flex items-center gap-2 text-sm text-foreground hover:text-primary"
                      >
                        {s.done ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground/50" />
                        )}
                        <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:translate-x-0.5 transition-transform" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {hoursAlerts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 font-semibold">
              <TriangleAlert className="h-4 w-4" />
              Hours warnings this week
            </div>
            <ul className="text-sm text-amber-900 list-disc list-inside">
              {hoursAlerts.map((r) => (
                <li key={r.employeeId}>
                  <strong>{r.name}</strong>: {r.assignedHours.toFixed(1)}h scheduled —{" "}
                  {r.status === "over"
                    ? `over the ${r.bindingMax.source} limit of ${r.bindingMax.hours.toFixed(1)}h`
                    : r.status === "under"
                      ? `under the ${r.minHours}h contract minimum`
                      : `approaching the ${r.bindingMax.source} limit of ${r.bindingMax.hours.toFixed(1)}h`}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {sickDetails.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-2 text-red-800 font-semibold">
              <Siren className="h-4 w-4" />
              {sickDetails.length} unconfirmed sick call{sickDetails.length > 1 ? "s" : ""} — please
              confirm you&apos;ve seen {sickDetails.length > 1 ? "them" : "it"}
            </div>
            <ul className="space-y-2">
              {sickDetails.map((call) => (
                <li key={call.id} className="flex items-center justify-between gap-3 text-sm text-red-900">
                  <span>
                    <strong>{call.employeeName}</strong> — {call.label}. Replacement search is
                    running.
                  </span>
                  <form action={confirmSickCall.bind(null, call.id)}>
                    <Button type="submit" size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">
                      Confirm
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Employees" value={location.employees.length} icon={Users} href={`/dashboard/${locationId}/employees`} />
        <StatCard label="Shift templates" value={location.shiftTemplates.length} icon={ClipboardList} href={`/dashboard/${locationId}/templates`} />
        <StatCard label="Schedules" value={location.schedules.length} icon={Calendar} href={`/dashboard/${locationId}/schedules`} />
      </div>

      <RulesCard locationId={locationId} rules={managerRules} />

      {/* Recent schedules */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent schedules</CardTitle>
          <Link
            href={`/dashboard/${locationId}/schedules`}
            className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {location.schedules.length === 0 ? (
            <div className="py-10 px-6 text-center text-sm text-slate-500">
              No schedules yet. They're generated automatically each week.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {location.schedules.map((sched) => (
                <li key={sched.id}>
                  <Link
                    href={`/dashboard/${locationId}/schedules/${sched.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors group"
                  >
                    <span className="text-sm font-medium text-slate-900">
                      w/c {new Date(sched.weekStart).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <div className="flex items-center gap-3">
                      <ScheduleBadge status={sched.status} />
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Employees */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Employees</CardTitle>
          <Link href={`/dashboard/${locationId}/employees`}>
            <Button variant="ghost" size="sm">
              Manage <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {location.employees.length === 0 ? (
            <div className="py-10 px-6 text-center text-sm text-slate-500">No employees yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {location.employees.slice(0, 6).map((emp) => (
                <li key={emp.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{emp.name}</p>
                    <p className="text-xs text-slate-500 truncate">{emp.email}</p>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {emp.roles.map((r) => (
                      <Badge key={r} variant="secondary" className="text-xs">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {location.employees.length > 6 && (
            <p className="text-xs text-slate-400 text-center py-3 border-t border-slate-100">
              + {location.employees.length - 6} more
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  href: string
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-slate-300 hover:shadow-sm transition-all">
        <CardContent className="py-5 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100">
            <Icon className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function ScheduleBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PUBLISHED: "bg-green-100 text-green-700 border-green-200",
    APPROVED: "bg-blue-100 text-blue-700 border-blue-200",
    DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
  }
  return (
    <Badge variant="outline" className={`text-xs ${map[status] ?? ""}`}>
      {status}
    </Badge>
  )
}

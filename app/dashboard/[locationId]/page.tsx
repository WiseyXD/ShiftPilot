import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/dashboard/page-header"
import { confirmSickCall } from "@/app/actions/sick"
import { getShiftStart, getShiftEnd, formatShiftDate } from "@/lib/scheduling/shift-date"
import { getHoursDistribution } from "@/lib/analytics/kpis"
import { RulesCard } from "@/components/dashboard/rules-card"
import { ChevronRight, ArrowRight, Siren, TriangleAlert, CheckCircle2, Circle, CalendarCheck, Clock, Timer } from "lucide-react"
import { Covrly } from "@/components/covrly"
import { WeekBoard, type BoardShift } from "@/components/dashboard/week-board"
import { FirstRunOverlay } from "@/components/dashboard/first-run-overlay"
import { KpiTiles } from "@/components/dashboard/kpi-tiles"
import { CoverageChart, ResponseChart, type CoveragePoint, type ResponsePoint } from "@/components/dashboard/dash-charts"
import { getWeatherToday } from "@/lib/weather/client"
import { getNearbyEventsToday } from "@/lib/events/client"
import { estimateTraffic } from "@/lib/events/traffic"
import { TodayPanel, type TodayShift } from "@/components/dashboard/today-panel"
import { getUserLang } from "@/lib/i18n/server"
import { ui, uiDateLocale } from "@/lib/i18n/dashboard"

const currentMonday = () => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

export default async function LocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string }>
  searchParams: Promise<{ week?: string; edit?: string }>
}) {
  const { locationId } = await params
  const { week, edit } = await searchParams
  const session = await auth()
  if (!session) redirect("/login")

  const lang = await getUserLang()
  const o = ui(lang).overview
  const d = ui(lang).dash
  const editMode = edit === "1"

  const location = await prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
    include: {
      employees: { orderBy: { createdAt: "asc" } },
      shiftTemplates: { orderBy: { startTime: "asc" } },
      schedules: { orderBy: { weekStart: "desc" }, take: 5 },
    },
  })
  if (!location) notFound()

  const weekStart = currentMonday()
  const todayDayOfWeek = new Date().getDay() // 0=Sun ... 6=Sat, matches Shift.dayOfWeek
  // Featured week: honour ?week=, else this week if it has a schedule, else the
  // nearest upcoming week that does — so a freshly created next-week plan lights
  // up the dashboard instead of showing an empty "this week".
  const curMs = weekStart.getTime()
  const scheduledMs = new Set(location.schedules.map((s) => new Date(s.weekStart).getTime()))
  const nearestUpcomingOffset = location.schedules
    .map((s) => Math.round((new Date(s.weekStart).getTime() - curMs) / (7 * 86400000)))
    .filter((off) => off > 0)
    .sort((a, b) => a - b)[0]
  const autoOffset = scheduledMs.has(curMs) ? 0 : nearestUpcomingOffset ?? 0
  const boardOffset = Math.max(-1, Math.min(1, week != null ? parseInt(week) || 0 : autoOffset))
  const boardWeekStart = new Date(weekStart.getTime() + boardOffset * 7 * 86400000)

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

  // Hours warnings for the featured week — early, before anything is blocked.
  const hoursReport = await getHoursDistribution(locationId, boardWeekStart)
  const hoursAlerts = hoursReport.filter(
    (r) => r.status !== "ok" || r.approaching || (r.assignedHours > 0 && r.bindingMax.hours === 0)
  )

  // "Today" panel — weather + nearby-event traffic (only if the venue has an
  // address on file) and today's shifts from the current week's schedule.
  const hasLocationCoords = location.lat != null && location.lng != null
  const [weather, events] = hasLocationCoords
    ? await Promise.all([
        getWeatherToday(location.lat!, location.lng!),
        getNearbyEventsToday(location.lat!, location.lng!),
      ])
    : [null, []]
  const traffic = estimateTraffic(events.length)

  const scheduleForWeek = (ws: Date) =>
    prisma.schedule.findFirst({
      where: { locationId, weekStart: ws },
      orderBy: { createdAt: "desc" },
      include: {
        shifts: {
          include: { employee: { select: { name: true } }, shiftTemplate: true },
        },
      },
    })

  const currentSchedule = await scheduleForWeek(weekStart)
  const boardSchedule = boardOffset === 0 ? currentSchedule : await scheduleForWeek(boardWeekStart)

  // First run: café is set up (shifts + team) but no schedule exists yet. The
  // dashboard is empty, so we lock it behind the guided flow that creates the
  // first week (and seeds real data). Setup still in progress → guide them first.
  const setupComplete = location.shiftTemplates.length > 0 && location.employees.length > 0
  const firstRunLocked = location.schedules.length === 0 && setupComplete

  const todayShifts: TodayShift[] = (currentSchedule?.shifts ?? [])
    .filter((s) => s.dayOfWeek === todayDayOfWeek)
    .map((s) => ({
      id: s.id,
      employeeName: s.employee?.name ?? "Unassigned",
      templateName: s.shiftTemplate.name,
      start: getShiftStart(weekStart, s.dayOfWeek, s.shiftTemplate.startTime),
      end: getShiftEnd(weekStart, s.dayOfWeek, s.shiftTemplate.endTime),
      status: s.status,
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  // ── KPI pulse (featured week) ───────────────────────────────────────────
  const featuredShifts = boardSchedule?.shifts ?? []
  const isFilled = (s: (typeof featuredShifts)[number]) =>
    s.employeeId != null && s.status !== "UNASSIGNED" && s.status !== "DECLINED"
  const filledCount = featuredShifts.filter(isFilled).length
  const openCount = featuredShifts.length - filledCount
  const coveragePct = featuredShifts.length
    ? Math.round((filledCount / featuredShifts.length) * 100)
    : 0
  const spanHours = (start: string, end: string) => {
    const [sh, sm] = start.split(":").map(Number)
    const [eh, em] = end.split(":").map(Number)
    return (eh * 60 + em - (sh * 60 + sm)) / 60
  }
  const plannedHours = featuredShifts
    .filter(isFilled)
    .reduce((sum, s) => sum + spanHours(s.shiftTemplate.startTime, s.shiftTemplate.endTime), 0)

  // ── Chart data ──────────────────────────────────────────────────────────
  const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0]
  const boardShiftsRaw = boardSchedule?.shifts ?? []
  const coverageData: CoveragePoint[] = WEEK_DAYS.map((dow, i) => {
    const dayShifts = boardShiftsRaw.filter((s) => s.dayOfWeek === dow)
    const filled = dayShifts.filter(isFilled).length
    return {
      day: new Date(boardWeekStart.getTime() + i * 86400000).toLocaleDateString(
        uiDateLocale(lang),
        { weekday: "short" }
      ),
      filled,
      open: dayShifts.length - filled,
    }
  })
  // SAMPLE DATA — response timestamps aren't tracked yet; replace when they are.
  const responseData: ResponsePoint[] = [3.8, 3.4, 3.6, 3.1, 2.8, 2.9, 2.5, 2.4].map(
    (hours, i) => ({
      week: new Date(weekStart.getTime() - (7 - i) * 7 * 86400000).toLocaleDateString(
        uiDateLocale(lang),
        { day: "numeric", month: "numeric" }
      ),
      hours,
    })
  )

  const boardShifts: BoardShift[] = boardShiftsRaw.map((s) => ({
    id: s.id,
    dayOfWeek: s.dayOfWeek,
    status: s.status,
    employeeId: s.employeeId,
    employeeName: s.employee?.name ?? null,
    templateId: s.shiftTemplateId,
  }))
  const generationDayLabel = new Date(2024, 0, 7 + location.generationDayOfWeek)
    .toLocaleDateString(uiDateLocale(lang), { weekday: "long" })

  // Deadline-rule transparency: who got left out of this draft, and — before
  // an early manual generation — how many minijobbers have confirmed so far.
  const droppedNames =
    ((boardSchedule?.notes as { autoDropped?: { name: string }[] } | null)?.autoDropped ?? []).map(
      (e) => e.name
    )
  let availabilityHint: string | null = null
  if (boardOffset === 1 && !boardSchedule) {
    const catA = location.employees.filter((e) => e.category === "MINIJOB_ZEITARBEIT")
    if (catA.length > 0) {
      const weekEnd = new Date(boardWeekStart.getTime() + 7 * 86400000)
      const [confirmations, overrides] = await Promise.all([
        prisma.availabilityConfirmation.findMany({
          where: { weekStart: boardWeekStart, employeeId: { in: catA.map((e) => e.id) } },
          select: { employeeId: true },
        }),
        prisma.availabilityOverride.findMany({
          where: {
            date: { gte: boardWeekStart, lt: weekEnd },
            employeeId: { in: catA.map((e) => e.id) },
          },
          select: { employeeId: true },
        }),
      ])
      const confirmed = new Set([...confirmations, ...overrides].map((c) => c.employeeId)).size
      if (confirmed < catA.length) availabilityHint = d.availabilityHint(confirmed, catA.length)
    }
  }

  return (
    <div className={`relative space-y-6${firstRunLocked ? " first-run-locked" : ""}`}>
      <PageHeader title={location.name} description={location.timezone} />

      {location.schedules.length === 0 && !setupComplete && (() => {
        const steps = [
          { done: location.shiftTemplates.length > 0, label: o.stepShifts, href: `/dashboard/${locationId}/templates` },
          { done: location.employees.length > 0, label: o.stepTeam, href: `/dashboard/${locationId}/employees` },
          { done: false, label: o.stepChat, href: `/dashboard/${locationId}/whatsapp` },
        ]
        const doneCount = steps.filter((s) => s.done).length
        return (
          <Card className="border-primary/20 bg-primary/[0.04]">
            <CardContent className="flex items-start gap-4 py-5">
              <Covrly size={64} wave className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-medium text-foreground">
                  {o.gettingStarted(location.name)}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {o.stepsDone(doneCount, steps.length)}
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
              {o.hoursWarnings}
            </div>
            <ul className="text-sm text-amber-900 list-disc list-inside">
              {hoursAlerts.map((r) => (
                <li key={r.employeeId}>
                  <strong>{r.name}</strong>: {o.scheduledHours(r.assignedHours.toFixed(1))} —{" "}
                  {r.status === "over"
                    ? o.overLimit(r.bindingMax.source, r.bindingMax.hours.toFixed(1))
                    : r.status === "under"
                      ? o.underMin(r.minHours)
                      : o.approachingLimit(r.bindingMax.source, r.bindingMax.hours.toFixed(1))}
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
              {o.sickBanner(sickDetails.length)}
            </div>
            <ul className="space-y-2">
              {sickDetails.map((call) => (
                <li key={call.id} className="flex items-center justify-between gap-3 text-sm text-red-900">
                  <span>
                    <strong>{call.employeeName}</strong> — {call.label}. {o.replacementRunning}
                  </span>
                  <form action={confirmSickCall.bind(null, call.id)}>
                    <Button type="submit" size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">
                      {o.confirm}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="rise rise-1">
        <TodayPanel
          hasLocationCoords={hasLocationCoords}
          addressSettingsHref="/dashboard/marketplace"
          weather={weather}
          events={events}
          traffic={traffic}
          todayShifts={todayShifts}
          lang={lang}
        />
      </div>

      {/* Pulse */}
      <div className="rise rise-2">
        <KpiTiles
          tiles={[
            {
              label: d.kpiCoverage,
              value: `${coveragePct}%`,
              sub: d.kpiCoverageSub(filledCount, featuredShifts.length),
              icon: CalendarCheck,
            },
            {
              label: d.kpiOpen,
              value: String(openCount),
              sub: d.kpiOpenSub,
              icon: TriangleAlert,
              tone: openCount > 0 ? "warn" : "default",
            },
            {
              label: d.kpiHours,
              value: `${Math.round(plannedHours)}${d.hoursUnit}`,
              sub: d.kpiHoursSub,
              icon: Clock,
            },
            // SAMPLE value — see responseData note above
            { label: d.kpiResponse, value: `2.4${d.hoursUnit}`, sub: d.kpiResponseSub, icon: Timer },
          ]}
        />
      </div>

      {/* The week board — scheduling happens here now */}
      <div className="rise rise-3">
        <WeekBoard
          locationId={locationId}
          lang={lang}
          weekOffset={boardOffset}
          weekStart={boardWeekStart}
          schedule={
            boardSchedule
              ? { id: boardSchedule.id, status: boardSchedule.status, shifts: boardShifts }
              : null
          }
          templates={location.shiftTemplates.map((t) => ({
            id: t.id,
            name: t.name,
            startTime: t.startTime,
            endTime: t.endTime,
          }))}
          generationDayLabel={generationDayLabel}
          editMode={editMode}
          employees={location.employees.map((e) => ({ id: e.id, name: e.name }))}
          droppedNames={droppedNames}
          availabilityHint={availabilityHint}
        />
      </div>

      {/* Charts */}
      <div className="rise rise-4 grid gap-6 lg:grid-cols-2">
        <CoverageChart lang={lang} data={coverageData} />
        <ResponseChart lang={lang} data={responseData} />
      </div>

      <div className="rise rise-5 grid items-start gap-6 lg:grid-cols-2">
      <RulesCard locationId={locationId} rules={managerRules} />

      {/* Employees */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{o.employees}</CardTitle>
          <Link href={`/dashboard/${locationId}/employees`}>
            <Button variant="ghost" size="sm">
              {o.manage} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {location.employees.length === 0 ? (
            <div className="py-10 px-6 text-center text-sm text-slate-500">{o.noEmployees}</div>
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
              {o.more(location.employees.length - 6)}
            </p>
          )}
        </CardContent>
      </Card>
      </div>

      {firstRunLocked && (
        <FirstRunOverlay locationId={locationId} locationName={location.name} />
      )}
    </div>
  )
}

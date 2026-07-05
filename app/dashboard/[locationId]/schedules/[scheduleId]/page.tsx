import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { redirect, notFound } from "next/navigation"
import { approveSchedule } from "@/app/actions/schedule"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/dashboard/page-header"
import { EditableCell } from "@/components/dashboard/editable-cell"
import { AddShiftCell } from "@/components/dashboard/add-shift-cell"
import Link from "next/link"
import { Sparkles, CheckCircle2, Pencil, Eye } from "lucide-react"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600 border-slate-200",
  ACCEPTED: "bg-green-100 text-green-700 border-green-200",
  DECLINED: "bg-red-100 text-red-700 border-red-200",
  REASSIGNED: "bg-blue-100 text-blue-700 border-blue-200",
  UNASSIGNED: "bg-yellow-100 text-yellow-700 border-yellow-200",
  LENT_OUT: "bg-purple-100 text-purple-700 border-purple-200",
  NO_SHOW: "bg-red-100 text-red-700 border-red-200",
}

const BORROWED_STYLE = "bg-purple-100 text-purple-700 border-purple-200"

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string; scheduleId: string }>
  searchParams: Promise<{ token?: string; demo?: string; edit?: string }>
}) {
  const { locationId, scheduleId } = await params
  const sp = await searchParams
  const approveToken = sp.token
  const isDemo = sp.demo === "1"
  const editMode = sp.edit === "1"

  const session = await auth()
  if (!session) redirect("/login")

  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, location: { ownerId: session.user.id } },
    include: {
      location: true,
      shifts: {
        include: {
          shiftTemplate: true,
          employee: true,
          sharingDeal: {
            select: {
              listing: { select: { role: true } },
              lenderLocation: { select: { name: true } },
              employee: { select: { name: true } },
            },
          },
        },
        orderBy: [{ shiftTemplate: { startTime: "asc" } }],
      },
    },
  })
  if (!schedule) notFound()

  // Pins for this week — marked on the grid so the manager sees what's fixed.
  const pins = await prisma.fixedShift.findMany({
    where: { locationId, OR: [{ weekStart: null }, { weekStart: schedule.weekStart }] },
    select: { employeeId: true, shiftTemplateId: true, dayOfWeek: true },
  })
  const pinnedKeys = new Set(pins.map((p) => `${p.shiftTemplateId}:${p.dayOfWeek}:${p.employeeId}`))

  const editableEmployees = editMode
    ? await prisma.employee.findMany({
        where: { locationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : []

  const templates = [...new Map(schedule.shifts.map((s) => [s.shiftTemplateId, s.shiftTemplate])).values()]
  const weekStart = schedule.weekStart
  const weekLabel = new Date(weekStart).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

  // Compute stats
  const total = schedule.shifts.length
  const accepted = schedule.shifts.filter((s) => s.status === "ACCEPTED" || s.status === "REASSIGNED").length
  const declined = schedule.shifts.filter((s) => s.status === "DECLINED").length

  return (
    <div className="space-y-6">
      {isDemo && schedule.status === "DRAFT" && (
        <Card className="border-blue-200 bg-blue-50">
          <div className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-blue-900 font-semibold">
              <Sparkles className="h-4 w-4" />
              Demo ready — here&apos;s what to do next
            </div>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 ml-1">
              <li>Review the schedule below (7 days × 3 shifts, auto-assigned round-robin)</li>
              <li>Click <strong>Approve &amp; notify employees</strong> — real emails go out</li>
              <li>Click <strong>Decline</strong> on a shift in the email → replacement engine fires</li>
              <li>Click <strong>Request a swap</strong> on another shift → swap broker fires</li>
              <li>Check the <strong>Audit log</strong> sidebar tab for every AI decision</li>
            </ol>
          </div>
        </Card>
      )}

      <PageHeader
        title={`Schedule — w/c ${weekLabel}`}
        description={schedule.location.name}
        action={
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/${locationId}/schedules/${scheduleId}${editMode ? "" : "?edit=1"}`}
            >
              <Button size="sm" variant="outline">
                {editMode ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                {editMode ? "Done editing" : "Edit"}
              </Button>
            </Link>
            <Badge
              variant="outline"
              className={
                schedule.status === "PUBLISHED"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : schedule.status === "APPROVED"
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }
            >
              {schedule.status}
            </Badge>
            {schedule.status === "DRAFT" && (
              <form action={approveSchedule.bind(null, scheduleId, approveToken ?? "")}>
                <Button type="submit">
                  <CheckCircle2 className="h-4 w-4" />
                  Approve &amp; notify employees
                </Button>
              </form>
            )}
          </div>
        }
      />

      {(() => {
        const notes = schedule.notes as {
          autoDropped?: { name: string; reason: string }[]
        } | null
        if (!notes?.autoDropped?.length) return null
        return (
          <Card className="border-amber-200 bg-amber-50">
            <div className="p-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">
                Not scheduled this week ({notes.autoDropped.length}):
              </p>
              <ul className="list-disc list-inside">
                {notes.autoDropped.map((d, i) => (
                  <li key={i}>
                    <strong>{d.name}</strong> — {d.reason}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )
      })()}

      {/* Quick stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Total shifts" value={total} />
        <MiniStat label="Accepted / reassigned" value={accepted} tone="green" />
        <MiniStat label="Declined" value={declined} tone={declined > 0 ? "red" : "slate"} />
      </div>

      {/* Grid */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-slate-600 font-medium sticky left-0 bg-slate-50 z-10 min-w-[140px]">
                  Shift
                </th>
                {DAYS.map((d) => (
                  <th key={d} className="px-3 py-3 text-slate-600 font-medium text-center min-w-[110px]">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map((tmpl) => (
                <tr key={tmpl.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 sticky left-0 bg-white z-10">
                    <p className="font-medium text-slate-900">{tmpl.name}</p>
                    <p className="text-xs text-slate-500">
                      {tmpl.startTime}–{tmpl.endTime}
                    </p>
                  </td>
                  {Array.from({ length: 7 }, (_, dow) => {
                    // A slot can hold several people (minHeadcount > 1) — show them all.
                    const cellShifts = schedule.shifts.filter(
                      (s) => s.shiftTemplateId === tmpl.id && s.dayOfWeek === dow
                    )
                    return (
                      <td key={dow} className="px-2 py-2 text-center align-middle">
                        {cellShifts.length === 0 ? (
                          editMode ? (
                            <AddShiftCell
                              scheduleId={scheduleId}
                              shiftTemplateId={tmpl.id}
                              dayOfWeek={dow}
                              employees={editableEmployees}
                            />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )
                        ) : (
                          <div className="flex flex-col items-center gap-1.5">
                            {cellShifts.map((shift) =>
                              editMode && shift.status !== "LENT_OUT" && !shift.sharingDealId ? (
                                <EditableCell
                                  key={shift.id}
                                  shiftId={shift.id}
                                  currentEmployeeId={shift.employeeId}
                                  employees={editableEmployees}
                                />
                              ) : (
                                <div
                                  key={shift.id}
                                  className="space-y-1 inline-flex flex-col items-center px-2 py-1 rounded-md hover:bg-slate-50 transition-colors"
                                >
                                  {shift.sharingDeal && !shift.employee ? (
                                    // Borrowed cover: worker name is safe to show here —
                                    // roster effects only run once the deal is FILLED.
                                    <>
                                      <p className="text-xs font-medium text-slate-900">
                                        {shift.sharingDeal.employee.name}
                                      </p>
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] px-1.5 py-0 h-4 ${BORROWED_STYLE}`}
                                      >
                                        Borrowed: {shift.sharingDeal.listing.role} —{" "}
                                        {shift.sharingDeal.lenderLocation.name}
                                      </Badge>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-xs font-medium text-slate-900">
                                        {shift.employeeId &&
                                          pinnedKeys.has(
                                            `${shift.shiftTemplateId}:${shift.dayOfWeek}:${shift.employeeId}`
                                          ) && (
                                            <span title="Pinned by manager" className="mr-0.5">
                                              📌
                                            </span>
                                          )}
                                        {shift.employee?.name ?? (
                                          <span className="text-yellow-600">Unfilled</span>
                                        )}
                                      </p>
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] px-1.5 py-0 h-4 ${STATUS_STYLES[shift.status]}`}
                                      >
                                        {shift.status === "LENT_OUT" ? "lent out" : shift.status === "NO_SHOW" ? "no-show" : shift.status.toLowerCase()}
                                      </Badge>
                                    </>
                                  )}
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function MiniStat({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "green" | "red" }) {
  const colorMap = {
    slate: "text-slate-900",
    green: "text-green-700",
    red: "text-red-700",
  }
  return (
    <Card className="p-4">
      <p className={`text-2xl font-bold leading-none ${colorMap[tone]}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </Card>
  )
}

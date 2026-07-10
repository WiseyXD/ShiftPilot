// The week board — the dashboard's centerpiece. A wall-planner view of one
// week (last / this / next) with the scheduling actions ON the board itself:
// draft next week early (Monday instead of waiting for the cron) and publish
// it, without a separate schedules tab.

import Link from "next/link"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, PencilLine, Check, Info } from "lucide-react"
import { ui, uiDateLocale, type UiLang } from "@/lib/i18n/dashboard"
import { GenerateDraftButton, PublishButton } from "./week-board-actions"
import { EditableCell } from "./editable-cell"
import { AddShiftCell } from "./add-shift-cell"

export interface BoardShift {
  id: string
  dayOfWeek: number
  status: string
  employeeId: string | null
  employeeName: string | null
  templateId: string
}

export interface BoardTemplate {
  id: string
  name: string
  startTime: string
  endTime: string
}

// Status ink: same palette the schedule pages use.
const DOT: Record<string, string> = {
  PENDING: "bg-slate-400",
  ACCEPTED: "bg-green-500",
  DECLINED: "bg-red-500",
  REASSIGNED: "bg-blue-500",
  UNASSIGNED: "bg-yellow-500",
  LENT_OUT: "bg-purple-500",
  NO_SHOW: "bg-red-500",
}

const SCHEDULE_BADGE: Record<string, string> = {
  PUBLISHED: "bg-green-100 text-green-700 border-green-200",
  APPROVED: "bg-blue-100 text-blue-700 border-blue-200",
  DRAFT: "bg-amber-100 text-amber-800 border-amber-200",
}

// Monday-start chronological order of Shift.dayOfWeek values.
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0]

export function WeekBoard({
  locationId,
  lang,
  weekOffset,
  weekStart,
  schedule,
  templates,
  generationDayLabel,
  editMode = false,
  employees = [],
  droppedNames = [],
  availabilityHint = null,
}: {
  locationId: string
  lang: UiLang
  weekOffset: number
  weekStart: Date
  schedule: { id: string; status: string; shifts: BoardShift[] } | null
  templates: BoardTemplate[]
  generationDayLabel: string
  editMode?: boolean
  employees?: { id: string; name: string }[]
  droppedNames?: string[]
  availabilityHint?: string | null
}) {
  const d = ui(lang).dash
  const locale = uiDateLocale(lang)
  const weekLabel = weekOffset === -1 ? d.lastWeek : weekOffset === 1 ? d.nextWeek : d.thisWeek
  const weekEnd = new Date(weekStart.getTime() + 6 * 86400000)
  const range = d.weekRange(
    weekStart.toLocaleDateString(locale, { day: "numeric", month: "short" }),
    weekEnd.toLocaleDateString(locale, { day: "numeric", month: "short" })
  )
  const todayDow = new Date().getDay()

  const dateOf = (dow: number) =>
    new Date(weekStart.getTime() + WEEK_DAYS.indexOf(dow) * 86400000)

  const cell = (templateId: string, dow: number) =>
    (schedule?.shifts ?? []).filter((s) => s.templateId === templateId && s.dayOfWeek === dow)

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/${locationId}?week=${weekOffset - 1}`}
            aria-disabled={weekOffset <= -1}
            className={weekOffset <= -1 ? "pointer-events-none opacity-30" : ""}
            scroll={false}
          >
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold leading-tight text-foreground">
              {weekLabel}
            </p>
            <p className="text-xs text-muted-foreground">{range}</p>
          </div>
          <Link
            href={`/dashboard/${locationId}?week=${weekOffset + 1}`}
            aria-disabled={weekOffset >= 1}
            className={weekOffset >= 1 ? "pointer-events-none opacity-30" : ""}
            scroll={false}
          >
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {schedule && (
            <Badge variant="outline" className={`text-xs ${SCHEDULE_BADGE[schedule.status] ?? ""}`}>
              {schedule.status}
            </Badge>
          )}
          {schedule?.status === "DRAFT" && (
            <PublishButton scheduleId={schedule.id} label={d.publish} />
          )}
          {!schedule && weekOffset === 1 && (
            <GenerateDraftButton locationId={locationId} label={d.createDraft} pendingLabel={d.generating} />
          )}
          {schedule && (
            // Editing happens right here on the board — no page change.
            <Link
              href={`/dashboard/${locationId}?week=${weekOffset}${editMode ? "" : "&edit=1"}`}
              scroll={false}
            >
              <Button variant={editMode ? "default" : "outline"} size="sm">
                {editMode ? <Check className="h-3.5 w-3.5" /> : <PencilLine className="h-3.5 w-3.5" />}
                {editMode ? d.doneEditing : d.editBoard}
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {droppedNames.length > 0 && (
          <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {d.droppedNote(droppedNames.join(", "))}
          </div>
        )}
        {!schedule ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            <p>{weekOffset === 1 ? d.noScheduleNext(generationDayLabel) : d.noSchedule}</p>
            {availabilityHint && (
              <p className="mx-auto mt-3 flex max-w-md items-start justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {availabilityHint}
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[52rem]"
              style={{ gridTemplateColumns: "9rem repeat(7, minmax(6.5rem, 1fr))" }}
            >
              {/* Day headers */}
              <div className="border-b border-border" />
              {WEEK_DAYS.map((dow) => {
                const isToday = weekOffset === 0 && dow === todayDow
                return (
                  <div
                    key={dow}
                    className={`border-b border-l border-border px-2 py-2 text-center ${
                      isToday ? "bg-accent/60" : ""
                    }`}
                  >
                    <p className={`text-xs font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>
                      {dateOf(dow).toLocaleDateString(locale, { weekday: "short" })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {dateOf(dow).toLocaleDateString(locale, { day: "numeric", month: "numeric" })}
                    </p>
                  </div>
                )
              })}

              {/* Template rows */}
              {templates.map((tpl, ti) => (
                <div key={tpl.id} className="contents">
                  <div
                    className={`flex flex-col justify-center px-3 py-2 ${ti > 0 ? "border-t border-border" : ""}`}
                  >
                    <p className="truncate text-xs font-medium text-foreground">{tpl.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {tpl.startTime}–{tpl.endTime}
                    </p>
                  </div>
                  {WEEK_DAYS.map((dow) => {
                    const isToday = weekOffset === 0 && dow === todayDow
                    const shifts = cell(tpl.id, dow)
                    return (
                      <div
                        key={dow}
                        className={`space-y-1 border-l border-border p-1.5 ${
                          ti > 0 ? "border-t" : ""
                        } ${isToday ? "bg-accent/40" : ""}`}
                      >
                        {shifts.map((s) =>
                          editMode && s.status !== "LENT_OUT" ? (
                            <EditableCell
                              key={s.id}
                              shiftId={s.id}
                              currentEmployeeId={s.employeeId}
                              employees={employees}
                            />
                          ) : s.status === "UNASSIGNED" || !s.employeeName ? (
                            <div
                              key={s.id}
                              className="rounded-md border border-dashed border-yellow-400/70 bg-yellow-50/60 px-1.5 py-1 text-[11px] font-medium text-yellow-800"
                            >
                              {d.openChip}
                            </div>
                          ) : (
                            <div
                              key={s.id}
                              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-1"
                              title={s.status}
                            >
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[s.status] ?? "bg-slate-400"}`} />
                              <span className="truncate text-[11px] text-foreground">{s.employeeName}</span>
                            </div>
                          )
                        )}
                        {editMode && shifts.length === 0 && (
                          <AddShiftCell
                            scheduleId={schedule.id}
                            shiftTemplateId={tpl.id}
                            dayOfWeek={dow}
                            employees={employees}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

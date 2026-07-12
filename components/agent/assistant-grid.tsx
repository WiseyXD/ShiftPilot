"use client"

import * as React from "react"
import { Loader2, CalendarDays } from "lucide-react"

// Compact, read-only schedule grid rendered inline in the chat after the
// copilot edits a week. Fetches live state so it always reflects the edit.

interface GridData {
  weekLabel: string
  range: string
  status: string | null
  templates: { id: string; name: string; startTime: string; endTime: string }[]
  shifts: { dayOfWeek: number; templateId: string; status: string; employeeName: string | null }[]
}

const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0]
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const DOT: Record<string, string> = {
  PENDING: "bg-slate-400",
  ACCEPTED: "bg-green-500",
  DECLINED: "bg-red-500",
  REASSIGNED: "bg-blue-500",
  UNASSIGNED: "bg-yellow-500",
  LENT_OUT: "bg-purple-500",
  NO_SHOW: "bg-red-500",
}
const LEGEND: { label: string; dot?: string; dashed?: boolean }[] = [
  { label: "Confirmed", dot: "bg-green-500" },
  { label: "Pending", dot: "bg-slate-400" },
  { label: "Open", dashed: true },
  { label: "Covered", dot: "bg-blue-500" },
]
const BADGE: Record<string, string> = {
  PUBLISHED: "bg-green-100 text-green-700 border-green-200",
  APPROVED: "bg-blue-100 text-blue-700 border-blue-200",
  DRAFT: "bg-amber-100 text-amber-800 border-amber-200",
}

const firstName = (n: string) => n.split(" ")[0]

export function AssistantGrid({
  locationId,
  weekOffset,
  highlight,
}: {
  locationId: string
  weekOffset: number
  highlight?: { dayOfWeek: number; templateId: string } | null
}) {
  const [data, setData] = React.useState<GridData | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    fetch(`/api/agent/${locationId}/grid?week=${weekOffset}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [locationId, weekOffset])

  if (failed) return null
  if (!data) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading schedule…
      </div>
    )
  }

  const cell = (tid: string, dow: number) =>
    data.shifts.filter((s) => s.templateId === tid && s.dayOfWeek === dow)

  return (
    <div className="mt-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <CalendarDays className="h-3.5 w-3.5 text-primary" />
          {data.weekLabel} · <span className="font-normal text-muted-foreground">{data.range}</span>
        </div>
        {data.status && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${BADGE[data.status] ?? "border-border text-muted-foreground"}`}>
            {data.status}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Shift</th>
              {DAY_LABELS.map((d) => (
                <th key={d} className="px-1 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.templates.map((t) => (
              <tr key={t.id} className="border-b border-border/60 last:border-0">
                <td className="px-2 py-1.5">
                  <p className="font-medium text-foreground">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground">{t.startTime}–{t.endTime}</p>
                </td>
                {WEEK_DAYS.map((dow) => {
                  const shifts = cell(t.id, dow)
                  const isHot = highlight != null && highlight.templateId === t.id && highlight.dayOfWeek === dow
                  return (
                    <td key={dow} className={`px-1 py-1.5 text-center align-top ${isHot ? "rounded-md bg-primary/10 ring-2 ring-primary/60 ring-inset" : ""}`}>
                      <div className="flex flex-col items-stretch gap-1">
                        {shifts.length === 0 ? (
                          <span className="text-muted-foreground/30">·</span>
                        ) : (
                          shifts.map((s, i) =>
                            s.status === "UNASSIGNED" || !s.employeeName ? (
                              <span key={i} className="rounded border border-dashed border-yellow-400/70 bg-yellow-50/60 px-1 py-0.5 text-[10px] font-medium text-yellow-800">Open</span>
                            ) : (
                              <span key={i} className="inline-flex items-center gap-1 rounded bg-muted px-1 py-0.5 text-[10px] text-foreground/80" title={s.status}>
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[s.status] ?? "bg-slate-400"}`} />
                                <span className="truncate">{firstName(s.employeeName)}</span>
                              </span>
                            )
                          )
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1">
            {l.dashed ? (
              <span className="h-2 w-2 rounded-[2px] border border-dashed border-yellow-400/80 bg-yellow-50" />
            ) : (
              <span className={`h-1.5 w-1.5 rounded-full ${l.dot}`} />
            )}
            {l.label}
          </span>
        ))}
      </div>
    </div>
  )
}

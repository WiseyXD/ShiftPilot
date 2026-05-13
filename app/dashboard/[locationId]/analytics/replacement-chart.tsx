"use client"

import type { WeeklyReplacementRate } from "@/lib/analytics/kpis"

export function ReplacementChart({ data }: { data: WeeklyReplacementRate[] }) {
  const maxVal = Math.max(...data.map((d) => d.resolved + d.escalated), 1)

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white">
      <div className="flex items-end gap-2 h-40">
        {data.map((week) => {
          const total = week.resolved + week.escalated
          const resolvedPct = (week.resolved / maxVal) * 100
          const escalatedPct = (week.escalated / maxVal) * 100
          return (
            <div key={week.weekStart} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-slate-500">{total}</span>
              <div className="w-full flex flex-col justify-end" style={{ height: "120px" }}>
                <div
                  className="w-full bg-red-400 rounded-t-none"
                  style={{ height: `${escalatedPct}%`, minHeight: week.escalated > 0 ? "4px" : "0" }}
                />
                <div
                  className="w-full bg-green-500"
                  style={{ height: `${resolvedPct}%`, minHeight: week.resolved > 0 ? "4px" : "0" }}
                />
              </div>
              <span className="text-[10px] text-slate-400 rotate-45 origin-left whitespace-nowrap">
                {new Date(week.weekStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-8 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> Resolved</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-400" /> Escalated</span>
      </div>
    </div>
  )
}

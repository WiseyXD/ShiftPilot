"use client"

import type { WeeklyAcceptance } from "@/lib/analytics/kpis"

export function AcceptanceTrend({ data }: { data: WeeklyAcceptance[] }) {
  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white">
      <div className="flex items-end gap-2 h-40">
        {data.map((week) => (
          <div key={week.weekStart} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs font-medium text-slate-700">{week.rate}%</span>
            <div className="w-full rounded-t-sm bg-blue-500" style={{ height: `${week.rate}%`, minHeight: "2px" }} />
            <span className="text-[10px] text-slate-400 rotate-45 origin-left whitespace-nowrap">
              {new Date(week.weekStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-8 flex justify-between text-xs text-slate-500">
        <span>0%</span>
        <span>100%</span>
      </div>
    </div>
  )
}

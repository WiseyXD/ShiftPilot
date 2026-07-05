"use client"

import type { EmployeeHours } from "@/lib/analytics/kpis"

export function HoursTable({ data }: { data: EmployeeHours[] }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Employee</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600">Min</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600">Assigned</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600">Max</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600">Legal max</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((emp) => (
            <tr
              key={emp.employeeId}
              className={
                emp.status === "over"
                  ? "bg-red-50"
                  : emp.status === "under"
                  ? "bg-amber-50"
                  : ""
              }
            >
              <td className="px-4 py-3 font-medium text-slate-900">{emp.name}</td>
              <td className="px-4 py-3 text-right text-slate-500">{emp.minHours}h</td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900">
                {emp.assignedHours.toFixed(1)}h
              </td>
              <td className="px-4 py-3 text-right text-slate-500">{emp.maxHours}h</td>
              <td className="px-4 py-3 text-right text-slate-500">
                {emp.bindingMax.hours.toFixed(1)}h
                <span className="block text-[10px] text-slate-400">{emp.bindingMax.source}</span>
              </td>
              <td className="px-4 py-3 text-right">
                {emp.status === "over" && (
                  <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                    Over max
                  </span>
                )}
                {emp.status === "under" && (
                  <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    Under min
                  </span>
                )}
                {emp.status === "ok" && emp.approaching && (
                  <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    Near {emp.bindingMax.source} limit
                  </span>
                )}
                {emp.weeksOverBudget && (
                  <span className="ml-1 text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                    {emp.weeksOverBudget.used}/{emp.weeksOverBudget.budget} wks &gt;20h
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

"use client"

import { useState } from "react"
import type { EmployeeNoShows } from "@/lib/analytics/kpis"

export function NoShowTable({ data }: { data: EmployeeNoShows[] }) {
  const [sortDesc, setSortDesc] = useState(true)
  const sorted = [...data].sort((a, b) => sortDesc ? b.count - a.count : a.count - b.count)

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Employee</th>
            <th
              className="text-right px-4 py-3 font-medium text-slate-600 cursor-pointer select-none hover:text-slate-900"
              onClick={() => setSortDesc((v) => !v)}
            >
              No-shows {sortDesc ? "↓" : "↑"}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((emp) => (
            <tr key={emp.employeeId}>
              <td className="px-4 py-3 text-slate-900">{emp.name}</td>
              <td className="px-4 py-3 text-right">
                <span
                  className={`font-semibold ${
                    emp.count >= 3 ? "text-red-600" : emp.count >= 1 ? "text-amber-600" : "text-slate-600"
                  }`}
                >
                  {emp.count}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

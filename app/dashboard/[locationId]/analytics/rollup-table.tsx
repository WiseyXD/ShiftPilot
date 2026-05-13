"use client"

interface RollupRow {
  locationName: string
  accepted: number
  total: number
  rate: number
}

export function RollupTable({ data }: { data: RollupRow[] }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Location</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600">Accepted</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600">Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((row) => (
            <tr key={row.locationName}>
              <td className="px-4 py-3 font-medium text-slate-900">{row.locationName}</td>
              <td className="px-4 py-3 text-right text-slate-600">{row.accepted}</td>
              <td className="px-4 py-3 text-right text-slate-600">{row.total}</td>
              <td className="px-4 py-3 text-right">
                <span
                  className={`font-semibold ${
                    row.rate >= 80 ? "text-green-600" : row.rate >= 60 ? "text-amber-600" : "text-red-600"
                  }`}
                >
                  {row.rate}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useState } from "react"
import { createVacation, deleteVacation } from "@/app/actions/vacation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plane } from "lucide-react"

interface VacationRow {
  id: string
  startDate: string
  endDate: string
  employee: { name: string }
}

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })

export function VacationsCard({ locationId }: { locationId: string }) {
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [vacations, setVacations] = useState<VacationRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const reload = useCallback(() => {
    fetch(`/api/locations/${locationId}/vacations`)
      .then((r) => r.json())
      .then((data) => {
        setEmployees(data.employees ?? [])
        setVacations(data.vacations ?? [])
      })
  }, [locationId])

  useEffect(reload, [reload])

  const submit = async (formData: FormData) => {
    setPending(true)
    const result = await createVacation(null, formData)
    setPending(false)
    setError(result && "error" in result ? result.error : null)
    setWarning(result && "warning" in result ? result.warning : null)
    if (!result || "warning" in result) reload()
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Plane className="h-4 w-4" />
          Vacations
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          On vacation = never scheduled, never asked to cover, never lent out.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
      {warning && (
        <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-md">{warning}</p>
      )}

      <form action={submit} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="locationId" value={locationId} />
        <select
          name="employeeId"
          required
          defaultValue=""
          className="border border-slate-200 rounded-md px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Employee
          </option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <div className="space-y-1">
          <label className="text-xs text-slate-500 block">From</label>
          <Input name="startDate" type="date" required className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500 block">Until (incl.)</label>
          <Input name="endDate" type="date" required className="w-40" />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Add vacation"}
        </Button>
      </form>

      <ul className="divide-y divide-slate-100">
        {vacations.map((v) => (
          <li key={v.id} className="py-2 flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-700">
              <strong>{v.employee.name}</strong> — {fmt(v.startDate)} to {fmt(v.endDate)}
            </span>
            <form
              action={async () => {
                await deleteVacation(v.id)
                reload()
              }}
            >
              <Button type="submit" variant="ghost" size="sm" className="text-slate-400 hover:text-red-600">
                Remove
              </Button>
            </form>
          </li>
        ))}
        {vacations.length === 0 && (
          <li className="py-2 text-sm text-slate-400">No current or upcoming vacations.</li>
        )}
      </ul>
    </Card>
  )
}

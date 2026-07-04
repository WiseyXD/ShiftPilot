"use client"

import { useCallback, useEffect, useState } from "react"
import {
  createFixedShift,
  deleteFixedShift,
  createBlockedTime,
  deleteBlockedTime,
} from "@/app/actions/rules"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Pin, Ban } from "lucide-react"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
// Display order Monday-first; values stay 0=Sun … 6=Sat.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

interface Named {
  id: string
  name: string
}

interface PinRow {
  id: string
  dayOfWeek: number
  weekStart: string | null
  employee: { name: string }
  shiftTemplate: { name: string }
}

interface BlockRow {
  id: string
  dayOfWeek: number
  employee: { name: string }
  shiftTemplate: { name: string } | null
}

const selectCls = "border border-slate-200 rounded-md px-3 py-2 text-sm"

export function PinsCard({ locationId }: { locationId: string }) {
  const [employees, setEmployees] = useState<Named[]>([])
  const [templates, setTemplates] = useState<Named[]>([])
  const [pins, setPins] = useState<PinRow[]>([])
  const [blocks, setBlocks] = useState<BlockRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pinScope, setPinScope] = useState<"permanent" | "week">("permanent")
  const [pending, setPending] = useState(false)

  const reload = useCallback(() => {
    fetch(`/api/locations/${locationId}/rules`)
      .then((r) => r.json())
      .then((data) => {
        setEmployees(data.employees ?? [])
        setTemplates(data.templates ?? [])
        setPins(data.pins ?? [])
        setBlocks(data.blocks ?? [])
      })
  }, [locationId])

  useEffect(reload, [reload])

  const submit =
    (action: (prev: null, fd: FormData) => Promise<{ error: string } | null>) =>
    async (formData: FormData) => {
      setPending(true)
      const result = await action(null, formData)
      setPending(false)
      setError(result?.error ?? null)
      if (!result?.error) reload()
    }

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Pin className="h-4 w-4" />
          Fixed shifts &amp; Sperrzeiten
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Pins always win a slot (only legal limits override). Sperrzeiten are never scheduled.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}

      {/* Pin form */}
      <form action={submit(createFixedShift)} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="locationId" value={locationId} />
        <select name="employeeId" required defaultValue="" className={selectCls}>
          <option value="" disabled>Employee</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <select name="shiftTemplateId" required defaultValue="" className={selectCls}>
          <option value="" disabled>Shift</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select name="dayOfWeek" required defaultValue="" className={selectCls}>
          <option value="" disabled>Day</option>
          {DAY_ORDER.map((d) => (
            <option key={d} value={d}>{DAYS[d]}</option>
          ))}
        </select>
        <select
          name="scope"
          value={pinScope}
          onChange={(e) => setPinScope(e.target.value as "permanent" | "week")}
          className={selectCls}
        >
          <option value="permanent">Every week</option>
          <option value="week">One week</option>
        </select>
        {pinScope === "week" && <Input name="week" type="date" required className="w-40" />}
        <Button type="submit" size="sm" disabled={pending}>
          Pin
        </Button>
      </form>

      <ul className="divide-y divide-slate-100">
        {pins.map((p) => (
          <li key={p.id} className="py-2 flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-700">
              <Pin className="h-3 w-3 inline mr-1 text-slate-400" />
              <strong>{p.employee.name}</strong> — {p.shiftTemplate.name}, {DAYS[p.dayOfWeek]}
              <Badge variant="secondary" className="ml-2 text-[10px]">
                {p.weekStart
                  ? `w/c ${new Date(p.weekStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                  : "every week"}
              </Badge>
            </span>
            <form
              action={async () => {
                await deleteFixedShift(p.id)
                reload()
              }}
            >
              <Button type="submit" variant="ghost" size="sm" className="text-slate-400 hover:text-red-600">
                Remove
              </Button>
            </form>
          </li>
        ))}
        {pins.length === 0 && <li className="py-2 text-sm text-slate-400">No pins yet.</li>}
      </ul>

      {/* Sperrzeit form */}
      <form action={submit(createBlockedTime)} className="flex flex-wrap items-end gap-2 pt-2 border-t border-slate-100">
        <input type="hidden" name="locationId" value={locationId} />
        <select name="employeeId" required defaultValue="" className={selectCls}>
          <option value="" disabled>Employee</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <select name="dayOfWeek" required defaultValue="" className={selectCls}>
          <option value="" disabled>Day</option>
          {DAY_ORDER.map((d) => (
            <option key={d} value={d}>{DAYS[d]}</option>
          ))}
        </select>
        <select name="shiftTemplateId" defaultValue="" className={selectCls}>
          <option value="">Whole day</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          <Ban className="h-3.5 w-3.5" />
          Block
        </Button>
      </form>

      <ul className="divide-y divide-slate-100">
        {blocks.map((b) => (
          <li key={b.id} className="py-2 flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-700">
              <Ban className="h-3 w-3 inline mr-1 text-red-400" />
              <strong>{b.employee.name}</strong> — never {b.shiftTemplate?.name ?? "any shift"},{" "}
              {DAYS[b.dayOfWeek]}
            </span>
            <form
              action={async () => {
                await deleteBlockedTime(b.id)
                reload()
              }}
            >
              <Button type="submit" variant="ghost" size="sm" className="text-slate-400 hover:text-red-600">
                Remove
              </Button>
            </form>
          </li>
        ))}
        {blocks.length === 0 && <li className="py-2 text-sm text-slate-400">No Sperrzeiten yet.</li>}
      </ul>
    </Card>
  )
}

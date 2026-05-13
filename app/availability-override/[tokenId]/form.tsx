"use client"

import { useActionState, useState } from "react"
import { submitAvailabilityOverride } from "@/app/actions/override"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface Template {
  id: string
  name: string
  startTime: string
  endTime: string
}

interface Props {
  tokenId: string
  employeeId: string
  weekStart: string
  templates: Template[]
  weekDates: string[]
  days: string[]
  recurringSet: Set<string>
}

export function OverrideForm({
  tokenId,
  employeeId,
  weekStart,
  templates,
  weekDates,
  days,
  recurringSet,
}: Props) {
  const [state, action, pending] = useActionState(submitAvailabilityOverride, null)

  // available[templateId:date] = bool (pre-filled from recurring pattern)
  const initialAvailable: Record<string, boolean> = {}
  for (const tmpl of templates) {
    for (let i = 0; i < weekDates.length; i++) {
      const key = `${tmpl.id}:${weekDates[i]}`
      initialAvailable[key] = recurringSet.has(`${tmpl.id}:${i}`)
    }
  }

  const [available, setAvailable] = useState(initialAvailable)

  if (state === null && !pending) {
    // check if the form was submitted (look for any action state change)
  }

  const toggle = (key: string) =>
    setAvailable((prev) => ({ ...prev, [key]: !prev[key] }))

  const availableSlots = Object.entries(available)
    .filter(([, v]) => v)
    .map(([k]) => {
      const [templateId, date] = k.split(":")
      return `${templateId}|${date}`
    })

  const unavailableSlots = Object.entries(available)
    .filter(([, v]) => !v)
    .map(([k]) => {
      const [templateId, date] = k.split(":")
      return `${templateId}|${date}`
    })

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tokenId" value={tokenId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="weekStart" value={weekStart} />
      {availableSlots.map((s) => (
        <input key={`av-${s}`} type="hidden" name="available" value={s} />
      ))}
      {unavailableSlots.map((s) => (
        <input key={`un-${s}`} type="hidden" name="unavailable" value={s} />
      ))}

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{state.error}</p>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-slate-600 font-medium w-32">Shift</th>
                {weekDates.map((d, i) => (
                  <th key={i} className="px-2 py-3 text-slate-600 font-medium text-center">
                    <div>{days[new Date(d).getDay()].slice(0, 3)}</div>
                    <div className="text-xs font-normal text-slate-400">
                      {new Date(d).getDate()}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map((tmpl) => (
                <tr key={tmpl.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{tmpl.name}</p>
                    <p className="text-xs text-slate-500">
                      {tmpl.startTime}–{tmpl.endTime}
                    </p>
                  </td>
                  {weekDates.map((d, i) => {
                    const key = `${tmpl.id}:${d}`
                    const isAvailable = available[key] ?? false
                    return (
                      <td key={i} className="px-2 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(key)}
                          className={`w-7 h-7 rounded-md border transition-colors ${
                            isAvailable
                              ? "bg-slate-900 border-slate-900"
                              : "bg-white border-slate-200 hover:border-slate-400"
                          }`}
                        >
                          {isAvailable && <span className="text-white text-xs">✓</span>}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save — no other changes"}
      </Button>
    </form>
  )
}

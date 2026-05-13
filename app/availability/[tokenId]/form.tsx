"use client"

import { useActionState } from "react"
import { submitRecurringAvailability } from "@/app/actions/availability"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useState } from "react"

interface Template {
  id: string
  name: string
  startTime: string
  endTime: string
}

interface Props {
  tokenId: string
  employeeId: string
  templates: Template[]
  days: string[]
  existingSlots: Set<string>
}

export function AvailabilityForm({ tokenId, employeeId, templates, days, existingSlots }: Props) {
  const [state, action, pending] = useActionState(submitRecurringAvailability, null)
  const [selected, setSelected] = useState<Set<string>>(new Set(existingSlots))

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  if (state === null && !pending && selected.size === 0 && existingSlots.size > 0) {
    return (
      <Card className="p-8 text-center space-y-2">
        <p className="text-lg font-medium text-slate-900">Availability saved!</p>
        <p className="text-slate-500 text-sm">
          Your schedule preferences have been recorded. You&apos;ll receive your schedule by email.
        </p>
      </Card>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tokenId" value={tokenId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      {[...selected].map((slot) => (
        <input key={slot} type="hidden" name="slots" value={slot} />
      ))}

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{state.error}</p>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-slate-600 font-medium">Shift</th>
                {days.map((day) => (
                  <th key={day} className="px-3 py-3 text-slate-600 font-medium text-center">
                    {day.slice(0, 3)}
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
                  {days.map((_, dayIdx) => {
                    const key = `${tmpl.id}:${dayIdx}`
                    return (
                      <td key={dayIdx} className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(key)}
                          className={`w-7 h-7 rounded-md border transition-colors ${
                            selected.has(key)
                              ? "bg-slate-900 border-slate-900"
                              : "bg-white border-slate-200 hover:border-slate-400"
                          }`}
                          aria-label={`${selected.has(key) ? "Remove" : "Add"} availability for ${tmpl.name} on ${days[dayIdx]}`}
                        >
                          {selected.has(key) && (
                            <span className="text-white text-xs">✓</span>
                          )}
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
        {pending ? "Saving…" : "Save availability"}
      </Button>
    </form>
  )
}

"use client"

import { useActionState, useState, useEffect } from "react"
import { createTemplate, deleteTemplate, updateLocationConfig } from "@/app/actions/template"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useParams } from "next/navigation"

import { PinsCard } from "@/components/dashboard/pins-card"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const COMMON_ROLES = ["Barista", "Chef", "Server", "Cashier", "Manager", "Kitchen", "Host"]

type Template = {
  id: string
  name: string
  startTime: string
  endTime: string
  minHeadcount: number
  requiredRoles: string[]
}

type LocationConfig = {
  generationDayOfWeek: number
  freezeWindowHours: number
  escalationTimeoutHours: number
  checkInGraceMinutes: number
  isPro: boolean
}

function AddTemplateForm({ locationId }: { locationId: string }) {
  const [state, action, pending] = useActionState(createTemplate, null)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])

  const toggleRole = (role: string) =>
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    )

  return (
    <Card className="p-6">
      <h2 className="font-semibold text-slate-900 mb-4">Add shift template</h2>
      <form action={action} className="space-y-4">
        <input type="hidden" name="locationId" value={locationId} />
        {selectedRoles.map((r) => (
          <input key={r} type="hidden" name="requiredRoles" value={r} />
        ))}
        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{state.error}</p>
        )}
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Template name</label>
          <Input name="name" required placeholder="e.g. Morning shift" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Start time</label>
            <Input name="startTime" type="time" required defaultValue="09:00" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">End time</label>
            <Input name="endTime" type="time" required defaultValue="17:00" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Min staff needed</label>
          <Input name="minHeadcount" type="number" min={1} defaultValue={1} className="w-24" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Required roles</label>
          <div className="flex flex-wrap gap-2">
            {COMMON_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  selectedRoles.includes(role)
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add template"}
        </Button>
      </form>
    </Card>
  )
}

function LocationConfigForm({ locationId, config }: { locationId: string; config: LocationConfig }) {
  const [state, action, pending] = useActionState(updateLocationConfig, null)

  return (
    <Card className="p-6">
      <h2 className="font-semibold text-slate-900 mb-4">Schedule settings</h2>
      <form action={action} className="space-y-4">
        <input type="hidden" name="locationId" value={locationId} />
        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{state.error}</p>
        )}
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Schedule generation day</label>
          <select
            name="generationDayOfWeek"
            defaultValue={config.generationDayOfWeek}
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
          >
            {DAYS.map((day, i) => (
              <option key={i} value={i}>{day}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">
            Freeze window (hours before shift)
            {!config.isPro && <span className="ml-2 text-xs text-amber-600">Pro only</span>}
          </label>
          <Input
            name="freezeWindowHours"
            type="number"
            min={1}
            defaultValue={config.freezeWindowHours}
            disabled={!config.isPro}
            className="w-24"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">No-show grace (minutes after start)</label>
          <Input
            name="checkInGraceMinutes"
            type="number"
            min={1}
            defaultValue={config.checkInGraceMinutes}
            className="w-24"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">
            Escalation timeout (hours)
            {!config.isPro && <span className="ml-2 text-xs text-amber-600">Pro only</span>}
          </label>
          <Input
            name="escalationTimeoutHours"
            type="number"
            min={1}
            defaultValue={config.escalationTimeoutHours}
            disabled={!config.isPro}
            className="w-24"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </Card>
  )
}

export default function TemplatesPage() {
  const params = useParams<{ locationId: string }>()
  const locationId = params.locationId
  const [templates, setTemplates] = useState<Template[]>([])
  const [config, setConfig] = useState<LocationConfig | null>(null)

  useEffect(() => {
    fetch(`/api/locations/${locationId}/templates`)
      .then((r) => r.json())
      .then((data) => {
        setTemplates(data.templates ?? [])
        setConfig(data.config ?? null)
      })
  }, [locationId])

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Shift templates</h1>
      <AddTemplateForm locationId={locationId} />
      {config && <LocationConfigForm locationId={locationId} config={config} />}
      <PinsCard locationId={locationId} />
      <div className="space-y-2">
        {templates.map((t) => (
          <Card key={t.id} className="px-4 py-3 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-slate-900">{t.name}</p>
              <p className="text-xs text-slate-500">
                {t.startTime} – {t.endTime} · min {t.minHeadcount} staff
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1 flex-wrap">
                {t.requiredRoles.map((r) => (
                  <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                ))}
              </div>
              <form action={async () => {
                await deleteTemplate(t.id)
                setTemplates((prev) => prev.filter((tmpl) => tmpl.id !== t.id))
              }}>
                <Button type="submit" variant="ghost" size="sm" className="text-red-500 hover:text-red-700">
                  Remove
                </Button>
              </form>
            </div>
          </Card>
        ))}
        {templates.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">
            No shift templates yet — add one above.
          </p>
        )}
      </div>
    </div>
  )
}

"use client"

import * as React from "react"
import { Covrly } from "@/components/covrly"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { completeOnboarding, type OnboardingTemplate, type OnboardingEmployee } from "@/app/actions/onboarding"
import { Plus, Trash2, Check, ArrowLeft, ArrowRight, Coffee, Clock, Users } from "lucide-react"

const TIMEZONES = ["Europe/Berlin", "Europe/Vienna", "Europe/Zurich", "Europe/London", "Europe/Paris", "UTC"]
const DAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"]
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const ROLES = ["Barista", "Service", "Kitchen", "Bar", "Küche", "Theke", "Spüle"]

const PRESET_TEMPLATES: OnboardingTemplate[] = [
  { name: "Frühschicht", startTime: "07:00", endTime: "13:00", minHeadcount: 2, requiredRoles: ["Barista", "Service"] },
  { name: "Mittagsschicht", startTime: "12:00", endTime: "17:00", minHeadcount: 1, requiredRoles: ["Service"] },
  { name: "Abendschicht", startTime: "17:00", endTime: "22:00", minHeadcount: 2, requiredRoles: ["Service", "Kitchen"] },
]

const STEPS = [
  { icon: Coffee, label: "Café" },
  { icon: Clock, label: "Shifts" },
  { icon: Users, label: "Team" },
  { icon: Check, label: "Done" },
]

const COVRLY_LINES = [
  "Hi, I'm Covrly! Let's set up your café — takes about two minutes. ☕",
  "What shifts does a typical week have? I've filled in the usual three — tweak away.",
  "Who's on the team? Add a few now, or after — your call.",
  "That's everything. I'll take it from here and draft your first week.",
]

const selectCls = "w-full border border-border bg-card rounded-md px-3 py-2 text-sm"

function RoleChips({ value, onChange }: { value: string[]; onChange: (r: string[]) => void }) {
  const toggle = (r: string) => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r])
  return (
    <div className="flex flex-wrap gap-1.5">
      {ROLES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => toggle(r)}
          className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
            value.includes(r)
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:border-primary/50"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

export function OnboardingWizard() {
  const [step, setStep] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const [name, setName] = React.useState("")
  const [timezone, setTimezone] = React.useState("Europe/Berlin")
  const [address, setAddress] = React.useState("")
  const [genDay, setGenDay] = React.useState(3)
  const [templates, setTemplates] = React.useState<OnboardingTemplate[]>(PRESET_TEMPLATES)
  const [employees, setEmployees] = React.useState<OnboardingEmployee[]>([
    { name: "", email: "", category: "MINIJOB_ZEITARBEIT", roles: [] },
  ])

  const canNext = step === 0 ? name.trim().length > 0 : step === 1 ? templates.length > 0 : true

  const finish = async () => {
    setSaving(true)
    setError(null)
    const res = await completeOnboarding({
      name,
      timezone,
      address,
      generationDayOfWeek: genDay,
      templates,
      employees: employees.filter((e) => e.name.trim() && e.email.trim()),
    })
    if (res?.error) {
      setError(res.error)
      setSaving(false)
    }
    // success → server redirects
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Covrly guide */}
      <div className="rise mb-6 flex items-start gap-4">
        <Covrly size={72} wave={step < 3} className="shrink-0 drop-shadow" />
        <div className="mt-2 rounded-2xl rounded-tl-none border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm">
          {COVRLY_LINES[step]}
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.label}>
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <s.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        {/* Step 1 — Café */}
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Café name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Café Minou" autoFocus />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Timezone">
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={selectCls}>
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </Field>
              <Field label="Plan day — when Covrly drafts next week">
                <select value={genDay} onChange={(e) => setGenDay(Number(e.target.value))} className={selectCls}>
                  {DAY_ORDER.map((d) => (
                    <option key={d} value={d}>{DAYS[d]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Address (optional — unlocks the staff marketplace)">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Kastanienallee 42, 10435 Berlin" />
            </Field>
          </div>
        )}

        {/* Step 2 — Shifts */}
        {step === 1 && (
          <div className="space-y-3">
            {templates.map((t, i) => (
              <div key={i} className="rounded-xl border border-border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={t.name}
                    onChange={(e) => setTemplates((ts) => ts.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))}
                    placeholder="Shift name"
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setTemplates((ts) => ts.filter((_, xi) => xi !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <LabeledMini label="From">
                    <Input type="time" value={t.startTime} onChange={(e) => setTemplates((ts) => ts.map((x, xi) => (xi === i ? { ...x, startTime: e.target.value } : x)))} />
                  </LabeledMini>
                  <LabeledMini label="Until">
                    <Input type="time" value={t.endTime} onChange={(e) => setTemplates((ts) => ts.map((x, xi) => (xi === i ? { ...x, endTime: e.target.value } : x)))} />
                  </LabeledMini>
                  <LabeledMini label="Min staff">
                    <Input type="number" min={1} value={t.minHeadcount} onChange={(e) => setTemplates((ts) => ts.map((x, xi) => (xi === i ? { ...x, minHeadcount: Number(e.target.value) } : x)))} />
                  </LabeledMini>
                </div>
                <RoleChips
                  value={t.requiredRoles}
                  onChange={(r) => setTemplates((ts) => ts.map((x, xi) => (xi === i ? { ...x, requiredRoles: r } : x)))}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTemplates((ts) => [...ts, { name: "", startTime: "09:00", endTime: "17:00", minHeadcount: 1, requiredRoles: [] }])}
            >
              <Plus className="h-4 w-4" /> Add a shift
            </Button>
          </div>
        )}

        {/* Step 3 — Team */}
        {step === 2 && (
          <div className="space-y-3">
            {employees.map((e, i) => (
              <div key={i} className="rounded-xl border border-border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Input value={e.name} onChange={(ev) => setEmployees((es) => es.map((x, xi) => (xi === i ? { ...x, name: ev.target.value } : x)))} placeholder="Name" className="flex-1" />
                  <button type="button" onClick={() => setEmployees((es) => es.filter((_, xi) => xi !== i))} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input type="email" value={e.email} onChange={(ev) => setEmployees((es) => es.map((x, xi) => (xi === i ? { ...x, email: ev.target.value } : x)))} placeholder="email@café.de" />
                  <select
                    value={e.category}
                    onChange={(ev) => setEmployees((es) => es.map((x, xi) => (xi === i ? { ...x, category: ev.target.value as OnboardingEmployee["category"] } : x)))}
                    className={selectCls}
                  >
                    <option value="MINIJOB_ZEITARBEIT">Minijob / Zeitarbeit</option>
                    <option value="TEILZEIT_FEST">Teilzeit / Festangestellt</option>
                  </select>
                </div>
                <RoleChips value={e.roles} onChange={(r) => setEmployees((es) => es.map((x, xi) => (xi === i ? { ...x, roles: r } : x)))} />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEmployees((es) => [...es, { name: "", email: "", category: "MINIJOB_ZEITARBEIT", roles: [] }])}
            >
              <Plus className="h-4 w-4" /> Add a team member
            </Button>
            <p className="text-xs text-muted-foreground">No rush — you can add the rest of your team anytime.</p>
          </div>
        )}

        {/* Step 4 — Review */}
        {step === 3 && (
          <div className="space-y-4 text-sm">
            <Summary label="Café" value={`${name || "—"} · ${timezone} · plans ${DAYS[genDay]}`} />
            <Summary label="Shifts" value={templates.map((t) => `${t.name} (${t.startTime}–${t.endTime})`).join(" · ") || "—"} />
            <Summary
              label="Team"
              value={
                employees.filter((e) => e.name.trim()).map((e) => e.name).join(", ") ||
                "None yet — you can add them after"
              }
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => canNext && setStep((s) => s + 1)} disabled={!canNext}>
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={finish} disabled={saving} size="lg">
            {saving ? "Setting up…" : "Create my café ☕"}
          </Button>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function LabeledMini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  )
}

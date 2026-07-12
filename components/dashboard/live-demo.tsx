"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Covrly } from "@/components/covrly"
import { publishFirstWeek, applyDemoSickReplacement, type SeedAssignment } from "@/app/actions/first-run"
import { contractStyle } from "@/lib/contract"
import {
  Sparkles, Play, Pause, CheckCheck, Phone, PartyPopper, ArrowRight, Loader2,
  Check, Pencil, Megaphone, HeartPulse, CalendarCheck,
} from "lucide-react"

// ─────────────────────────────────────────────────────────────────────────────
// First-run guided flow. A scripted, pausable 4-scene story — Availability →
// Draft & edit → Publish → Cover a call-out → Done — that commits REAL data at
// publish (and the sick→cover reassignment) so the dashboard is populated when
// the manager exits. Front-end paced so it never stalls on stage.
// ─────────────────────────────────────────────────────────────────────────────

interface Employee {
  id: string
  name: string
  roles: string[]
  category: "MINIJOB_ZEITARBEIT" | "TEILZEIT_FEST"
}
interface Template {
  id: string
  name: string
  startTime: string
  endTime: string
  minHeadcount: number
}
type Scene = "availability" | "draft" | "publish" | "sick" | "done"
// seat = which of the shift's minHeadcount slots this row is (0-based).
interface Assignment { shiftTemplateId: string; dayOfWeek: number; seat: number; employeeId: string | null }

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const FRI = 4

const DEFAULT_TEAM: Employee[] = [
  { id: "d1", name: "Marco Rossi", roles: ["Barista"], category: "MINIJOB_ZEITARBEIT" },
  { id: "d2", name: "Lena Weber", roles: ["Service"], category: "MINIJOB_ZEITARBEIT" },
  { id: "d3", name: "Yusuf Demir", roles: ["Barista"], category: "TEILZEIT_FEST" },
  { id: "d4", name: "Sofia Klein", roles: ["Service"], category: "MINIJOB_ZEITARBEIT" },
]
const DEFAULT_TEMPLATES: Template[] = [
  { id: "t1", name: "Morning shift", startTime: "07:00", endTime: "13:00", minHeadcount: 2 },
  { id: "t2", name: "Evening shift", startTime: "17:00", endTime: "22:00", minHeadcount: 1 },
]

const firstName = (n: string) => n.split(" ")[0]
const initials = (n: string) => n.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()

function fmt(body: string): React.ReactNode[] {
  return body.split("\n").flatMap((line, li) => {
    const parts = line.split(/(\*[^*]+\*)/g).map((seg, si) =>
      seg.startsWith("*") && seg.endsWith("*") ? <strong key={si}>{seg.slice(1, -1)}</strong> : <React.Fragment key={si}>{seg}</React.Fragment>
    )
    return li === 0 ? parts : [<br key={`br${li}`} />, ...parts]
  })
}

function Appear({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const [shown, setShown] = React.useState(false)
  React.useEffect(() => {
    const t = setTimeout(() => setShown(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div className={className} style={{ opacity: shown ? 1 : 0, transform: shown ? "translateY(0)" : "translateY(6px)", transition: "opacity .4s ease, transform .4s ease" }}>
      {children}
    </div>
  )
}

// WhatsApp bubbles
const AgentBubble = ({ children }: { children: React.ReactNode }) => (
  <div className="max-w-[88%] self-start rounded-lg rounded-tl-none bg-white px-3 py-2 text-[13px] leading-snug text-[#111b21] shadow-sm">{children}</div>
)
const MeBubble = ({ children }: { children: React.ReactNode }) => (
  <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[13px] leading-snug text-[#111b21] shadow-sm">
    {children}
    <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[#667781]"><CheckCheck className="h-3 w-3 text-[#53bdeb]" /></span>
  </div>
)
const ThreadShell = ({ name, sub, category, replied, children }: { name: string; sub: string; category?: string | null; replied?: boolean; children: React.ReactNode }) => (
  <div className={`flex flex-col overflow-hidden rounded-xl border shadow-sm transition-all ${replied ? "border-primary/40" : "border-border"}`}>
    <div className="flex items-center gap-2 bg-[#008069] px-3 py-2 text-white">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">{initials(name)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{firstName(name)}</p>
        <p className="flex items-center gap-1 text-[10px] text-white/70">
          {contractStyle(category) && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${contractStyle(category)!.dot}`} />}
          {sub}
        </p>
      </div>
      {replied && <CheckCheck className="h-4 w-4 text-[#8fe6ff]" />}
    </div>
    <div className="flex min-h-[8.5rem] flex-1 flex-col gap-1.5 px-3 py-3" style={{ backgroundColor: "#efeae2" }}>{children}</div>
  </div>
)

const STEPS: { key: Scene; label: string; icon: React.ElementType }[] = [
  { key: "availability", label: "Availability", icon: Phone },
  { key: "draft", label: "Draft & edit", icon: Pencil },
  { key: "publish", label: "Publish", icon: Megaphone },
  { key: "sick", label: "Cover a call-out", icon: HeartPulse },
]

export function LiveDemo({
  locationId, locationName, employees, templates,
}: {
  locationId: string
  locationName: string
  employees: Employee[]
  templates: Template[]
}) {
  const router = useRouter()
  const usingRealData = employees.length > 0 && templates.length > 0
  const team = usingRealData ? employees : DEFAULT_TEAM
  const tmpls = usingRealData ? templates : DEFAULT_TEMPLATES

  const offEmp = team.length > 1 ? team[1] : null
  const offTemplate = tmpls[tmpls.length - 1]

  const catSub = (e: Employee) => (e.category === "TEILZEIT_FEST" ? "Festangestellt" : "Minijob")
  const replyOf = (e: Employee) =>
    offEmp && e.id === offEmp.id
      ? { text: `❌ Can't do ${DAY_LABELS[FRI]} *${offTemplate.name}* next week, sorry 🙏`, ack: `Got it — leaving you off ${DAY_LABELS[FRI]} ${offTemplate.name}. 👍` }
      : { text: "✅ All good — thanks!", ack: "Great, scheduling you as usual. 🙌" }

  // Initial round-robin assignments: one seat per head (minHeadcount), distinct
  // people per slot, skipping offEmp on their blocked Friday shift. Extra seats
  // with no one left stay open (null) — same shape as the real generator.
  const initialAssignments = React.useMemo<Assignment[]>(() => {
    const out: Assignment[] = []
    let rr = 0
    for (const t of tmpls) {
      const seats = Math.max(1, t.minHeadcount)
      for (let d = 0; d < 7; d++) {
        const used = new Set<string>()
        for (let seat = 0; seat < seats; seat++) {
          let empId: string | null = null
          for (let tries = 0; tries < team.length; tries++) {
            const cand = team[rr % team.length]
            rr++
            const blocked = offEmp && t.id === offTemplate.id && d === FRI && cand.id === offEmp.id
            if (!used.has(cand.id) && !blocked) {
              empId = cand.id
              used.add(cand.id)
              break
            }
          }
          out.push({ shiftTemplateId: t.id, dayOfWeek: d, seat, employeeId: empId })
        }
      }
    }
    return out
  }, [team, tmpls, offEmp, offTemplate])

  const [assignments, setAssignments] = React.useState<Assignment[]>(initialAssignments)
  const cellsOf = (tid: string, d: number) =>
    assignments.filter((a) => a.shiftTemplateId === tid && a.dayOfWeek === d).sort((a, b) => a.seat - b.seat)
  const empById = (id: string | null) => team.find((e) => e.id === id) ?? null
  const filled = assignments.filter((a) => a.employeeId).length

  // ── Flow state ──
  const [scene, setScene] = React.useState<Scene>("availability")
  const [asked, setAsked] = React.useState(false)
  const [revealed, setRevealed] = React.useState(0)
  const [autoplay, setAutoplay] = React.useState(false)
  const [editingKey, setEditingKey] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [scheduleId, setScheduleId] = React.useState<string | null>(null)
  const [sickStep, setSickStep] = React.useState(0) // 0 idle · 1 reported · 2 asked · 3 covered

  const sceneIndex = STEPS.findIndex((s) => s.key === scene)
  const topRef = React.useRef<HTMLDivElement>(null)
  const goScene = (s: Scene) => { setScene(s); setAutoplay(false); topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) }

  // Sick-scene cast: the first person with a shift calls in sick; a teammate covers.
  const sickAssignment = React.useMemo(() => assignments.find((a) => a.employeeId) ?? null, [assignments])
  const sickEmp = empById(sickAssignment?.employeeId ?? null)
  const coverEmp = team.find((e) => e.id !== sickEmp?.id) ?? null
  const sickTmpl = tmpls.find((t) => t.id === sickAssignment?.shiftTemplateId) ?? null

  const publishAndGo = async () => {
    if (busy) return
    setBusy(true)
    if (usingRealData) {
      const res = await publishFirstWeek(locationId, assignments as SeedAssignment[])
      if (res && "scheduleId" in res && res.scheduleId) setScheduleId(res.scheduleId)
    }
    setBusy(false)
    goScene("publish")
  }

  const applySick = async () => {
    if (usingRealData && scheduleId && sickAssignment && coverEmp) {
      await applyDemoSickReplacement(locationId, scheduleId, {
        shiftTemplateId: sickAssignment.shiftTemplateId,
        dayOfWeek: sickAssignment.dayOfWeek,
        toEmployeeId: coverEmp.id,
        sickName: firstName(sickEmp?.name ?? ""),
        coverName: firstName(coverEmp.name),
      })
    }
  }

  const advance = () => {
    if (scene === "availability") {
      if (!asked) return setAsked(true)
      if (revealed < team.length) return setRevealed((r) => r + 1)
      return goScene("draft")
    }
    if (scene === "draft") return void publishAndGo()
    if (scene === "publish") return goScene("sick")
    if (scene === "sick") {
      if (sickStep < 3) {
        const next = sickStep + 1
        setSickStep(next)
        if (next === 3) void applySick()
        return
      }
      return goScene("done")
    }
    if (scene === "done") return router.push(`/dashboard/${locationId}`)
  }

  // Auto-play only through the tedious reveals (replies + sick beats); stops at
  // scene gates so the presenter controls pacing.
  React.useEffect(() => {
    if (!autoplay) return
    const inReplies = scene === "availability" && asked && revealed < team.length
    const inSick = scene === "sick" && sickStep < 3
    if (!inReplies && !inSick) return
    const t = setTimeout(advance, 1300)
    return () => clearTimeout(t)
  }, [autoplay, scene, asked, revealed, sickStep]) // eslint-disable-line react-hooks/exhaustive-deps

  const repliedCount = scene === "availability" ? (asked ? revealed : 0) : team.length

  // Primary button label
  const cta = (() => {
    if (scene === "availability") return !asked ? "Ask the team on WhatsApp" : revealed < team.length ? "Next reply" : "Build the draft"
    if (scene === "draft") return busy ? "Publishing…" : "Publish & notify the team"
    if (scene === "publish") return "Continue"
    if (scene === "sick") return ["Show the sick call", "Covrly finds cover", "Confirm the cover", "Finish"][sickStep]
    return "Go to dashboard"
  })()
  const canAutoplay = (scene === "availability" && asked && revealed < team.length) || (scene === "sick" && sickStep < 3)

  return (
    <div ref={topRef} className="space-y-6 pb-24">
      {/* Progress rail */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {STEPS.map((s, i) => {
          const state = i < sceneIndex || scene === "done" ? "done" : i === sceneIndex ? "active" : "todo"
          return (
            <React.Fragment key={s.key}>
              <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                state === "active" ? "bg-primary text-primary-foreground" : state === "done" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {state === "done" ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`h-px flex-1 ${i < sceneIndex || scene === "done" ? "bg-primary/40" : "bg-border"}`} />}
            </React.Fragment>
          )
        })}
      </div>

      {/* Control bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-gradient-to-br from-primary/[0.06] to-transparent p-5 sm:flex-row sm:items-center">
        <Covrly size={52} wave={scene !== "done"} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">First week · {locationName}</p>
          <p className="text-sm text-muted-foreground">{sceneBlurb(scene, { count: team.length, revealed, filled, sickStep, sickName: firstName(sickEmp?.name ?? ""), coverName: firstName(coverEmp?.name ?? "") })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canAutoplay && (
            <button onClick={() => setAutoplay((a) => !a)} title={autoplay ? "Pause" : "Auto-play"} className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-primary hover:text-primary">
              {autoplay ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
          )}
          <button onClick={advance} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-70">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : scene === "availability" && !asked ? <Megaphone className="h-4 w-4" /> : scene === "done" ? <CalendarCheck className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            {cta}
          </button>
        </div>
      </div>

      {/* Scene body (remounts per scene → cross-fades) */}
      <div key={scene} style={{ animation: "sceneIn .45s ease" }}>
        {(scene === "availability" || scene === "publish") && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {team.map((e, i) => {
              const r = replyOf(e)
              const hasReplied = i < repliedCount
              return (
                <ThreadShell key={e.id} name={e.name} sub={catSub(e)} category={e.category} replied={scene === "availability" ? hasReplied : true}>
                  {scene === "availability" ? (
                    <>
                      {asked ? (
                        <Appear><AgentBubble>{fmt('📅 First week is being planned! What *can\'t* you work? Tap "All good" or a shift.')}</AgentBubble></Appear>
                      ) : (
                        <p className="m-auto text-center text-xs text-[#54656f]/70">Tap “Ask the team” to start…</p>
                      )}
                      {hasReplied && <Appear><MeBubble>{fmt(r.text)}</MeBubble></Appear>}
                      {hasReplied && <Appear delay={250}><AgentBubble>{fmt(r.ack)}</AgentBubble></Appear>}
                    </>
                  ) : (
                    <Appear delay={i * 180}>
                      <AgentBubble>{fmt(planFor(e, assignments, tmpls))}</AgentBubble>
                    </Appear>
                  )}
                </ThreadShell>
              )
            })}
          </div>
        )}

        {scene === "draft" && (
          <ScheduleEditor
            tmpls={tmpls} team={team}
            cellsOf={cellsOf} empById={empById}
            editingKey={editingKey} setEditingKey={setEditingKey}
            onAssign={(tid, d, seat, empId) =>
              setAssignments((prev) =>
                prev.map((a) => (a.shiftTemplateId === tid && a.dayOfWeek === d && a.seat === seat ? { ...a, employeeId: empId } : a))
              )
            }
            offEmp={offEmp} offTemplate={offTemplate} filled={filled}
          />
        )}

        {scene === "sick" && sickEmp && coverEmp && sickTmpl && (
          <SickScene sickEmp={sickEmp} coverEmp={coverEmp} tmpl={sickTmpl} catSub={catSub} step={sickStep} />
        )}

        {scene === "done" && (
          <DoneScene locationName={locationName} filled={filled} total={assignments.length} onGo={() => router.push(`/dashboard/${locationId}`)} />
        )}
      </div>

      <style>{`@keyframes sceneIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }`}</style>
    </div>
  )
}

// ── Scene: editable draft ─────────────────────────────────────────────────────
function ScheduleEditor({
  tmpls, team, cellsOf, empById, editingKey, setEditingKey, onAssign, offEmp, offTemplate, filled,
}: {
  tmpls: Template[]
  team: Employee[]
  cellsOf: (tid: string, d: number) => Assignment[]
  empById: (id: string | null) => Employee | null
  editingKey: string | null
  setEditingKey: (k: string | null) => void
  onAssign: (tid: string, d: number, seat: number, empId: string | null) => void
  offEmp: Employee | null
  offTemplate: Template
  filled: number
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div>
          <p className="font-display text-lg font-semibold text-foreground">Review &amp; tweak the draft</p>
          <p className="text-xs text-muted-foreground">Tap any cell to reassign · {filled} shifts filled</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><Pencil className="h-3.5 w-3.5" /> Editable</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Shift</th>
              {DAY_LABELS.map((d) => <th key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {tmpls.map((t) => (
              <tr key={t.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-foreground">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t.startTime}–{t.endTime}
                    {t.minHeadcount > 1 && <span className="ml-1 text-primary">· {t.minHeadcount} staff</span>}
                  </p>
                </td>
                {DAY_LABELS.map((_, d) => {
                  const seats = cellsOf(t.id, d)
                  return (
                    <td key={d} className="px-2 py-2.5 align-top">
                      <div className="flex flex-col items-center gap-1">
                        {seats.map((cell) => {
                          const emp = empById(cell.employeeId)
                          const key = `${t.id}:${d}:${cell.seat}`
                          const editing = editingKey === key
                          return (
                            <div key={cell.seat} className="relative">
                              <button
                                onClick={() => setEditingKey(editing ? null : key)}
                                className={`inline-flex min-w-[3.5rem] items-center justify-center rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                                  editing ? "bg-primary text-primary-foreground ring-2 ring-primary/40" : emp ? "bg-muted text-foreground/80 hover:bg-primary/10 hover:text-primary" : "bg-muted/50 text-muted-foreground hover:bg-primary/10"
                                }`}
                              >
                                {emp ? firstName(emp.name) : "— open —"}
                              </button>
                              {editing && (
                                <div className="absolute left-1/2 top-full z-20 mt-1 w-40 -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-card text-left shadow-xl">
                                  {team.map((m) => (
                                    <button key={m.id} onClick={() => { onAssign(t.id, d, cell.seat, m.id); setEditingKey(null) }}
                                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-primary/10 ${cell.employeeId === m.id ? "text-primary font-medium" : "text-foreground"}`}>
                                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#008069]/15 text-[9px] font-semibold text-[#075e54]">{initials(m.name)}</span>
                                      {firstName(m.name)}
                                      {cell.employeeId === m.id && <Check className="ml-auto h-3.5 w-3.5" />}
                                    </button>
                                  ))}
                                  <button onClick={() => { onAssign(t.id, d, cell.seat, null); setEditingKey(null) }} className="w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted">Leave open</button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {offEmp && (
        <div className="flex items-center gap-2 border-t border-border bg-primary/[0.04] px-5 py-2.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span><strong className="text-foreground">{firstName(offEmp.name)}</strong> blocked {DAY_LABELS[FRI]} {offTemplate.name}, so Covrly kept them off it. Change anything, then publish.</span>
        </div>
      )}
    </div>
  )
}

// ── Scene: sick call → cover ──────────────────────────────────────────────────
function SickScene({ sickEmp, coverEmp, tmpl, catSub, step }: { sickEmp: Employee; coverEmp: Employee; tmpl: Template; catSub: (e: Employee) => string; step: number }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>The morning before the shift</strong> — {firstName(sickEmp.name)} wakes up ill. Watch Covrly handle it, no manager needed.
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ThreadShell name={sickEmp.name} sub={catSub(sickEmp)} category={sickEmp.category} replied={step >= 1}>
          {step >= 1 && <Appear><MeBubble>{fmt(`🤒 I can't make it tomorrow — I'm sick 😷`)}</MeBubble></Appear>}
          {step >= 1 && <Appear delay={250}><AgentBubble>{fmt(`Get well soon! 🤒 I've told your manager and I'm finding cover right now. 🔎`)}</AgentBubble></Appear>}
          {step < 1 && <p className="m-auto text-center text-xs text-[#54656f]/70">Waiting…</p>}
        </ThreadShell>
        <ThreadShell name={coverEmp.name} sub={catSub(coverEmp)} category={coverEmp.category} replied={step >= 3}>
          {step >= 2 && <Appear><AgentBubble>{fmt(`🔔 Can you cover the *${tmpl.name}* (${tmpl.startTime}–${tmpl.endTime}) tomorrow for ${firstName(sickEmp.name)}?`)}</AgentBubble></Appear>}
          {step >= 3 && <Appear><MeBubble>🙋 Yes, I can</MeBubble></Appear>}
          {step >= 3 && <Appear delay={250}><AgentBubble>{fmt(`✅ You're covering the *${tmpl.name}* tomorrow. Thanks for stepping in! ☕`)}</AgentBubble></Appear>}
          {step < 2 && <p className="m-auto text-center text-xs text-[#54656f]/70">{step >= 1 ? "Covrly is finding cover…" : "Waiting…"}</p>}
        </ThreadShell>
      </div>
      {step >= 3 && (
        <Appear>
          <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#008069]"><Covrly size={28} /></span>
            <p className="text-sm text-foreground"><strong>Covered.</strong> {firstName(coverEmp.name)} is taking {firstName(sickEmp.name)}&rsquo;s {tmpl.name} — logged, and your manager was notified. You did nothing. ✨</p>
          </div>
        </Appear>
      )}
    </div>
  )
}

// ── Confetti (dependency-free) ────────────────────────────────────────────────
// Deterministic pseudo-random (GLSL-style hash) — pure, so no Math.random in
// render and the scatter is stable across re-renders.
const hash = (i: number, s: number) => {
  const x = Math.sin((i + 1) * 12.9898 + s * 78.233) * 43758.5453
  return x - Math.floor(x)
}
function Confetti() {
  const pieces = React.useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: hash(i, 1) * 100,
        delay: hash(i, 2) * 0.5,
        dur: 2.4 + hash(i, 3) * 1.8,
        color: ["#C9724A", "#008069", "#F4EAD8", "#3B2A20", "#e0b24a"][i % 5],
        w: 6 + hash(i, 4) * 6,
        rot: hash(i, 5) * 360,
      })),
    []
  )
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: "-6%",
            left: `${p.left}%`,
            width: p.w,
            height: p.w * 1.5,
            background: p.color,
            borderRadius: 2,
            transform: `rotate(${p.rot}deg)`,
            animation: `confettiFall ${p.dur}s ${p.delay}s cubic-bezier(.2,.6,.4,1) forwards`,
          }}
        />
      ))}
      <style>{`@keyframes confettiFall { 0% { opacity: 1; transform: translateY(0) rotate(0) } 100% { opacity: .85; transform: translateY(112vh) rotate(680deg) } }`}</style>
    </div>
  )
}

// ── Scene: done ───────────────────────────────────────────────────────────────
function DoneScene({ locationName, filled, total, onGo }: { locationName: string; filled: number; total: number; onGo: () => void }) {
  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] to-transparent p-8 text-center" style={{ animation: "sceneIn .5s ease" }}>
      <Confetti />
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary"><PartyPopper className="h-8 w-8" /></div>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">{locationName} is live 🎉</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        First week published ({filled}/{total} shifts), the team notified on WhatsApp, and a sick call already covered — hands-free. Your dashboard is now populated and ready.
      </p>
      <button onClick={onGo} className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.03] active:scale-95">
        Go to dashboard <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────
function planFor(e: Employee, assignments: Assignment[], tmpls: Template[]): string {
  const mine = assignments.filter((a) => a.employeeId === e.id)
  const lines = mine.slice(0, 4).map((a) => {
    const t = tmpls.find((x) => x.id === a.shiftTemplateId)
    return `${DAY_LABELS[a.dayOfWeek]} · *${t?.name}* ${t?.startTime}–${t?.endTime}`
  })
  const extra = mine.length > 4 ? `\n…and ${mine.length - 4} more` : ""
  return `📋 Your shifts for next week:\n\n${lines.join("\n")}${extra}`
}

function sceneBlurb(scene: Scene, d: { count: number; revealed: number; filled: number; sickStep: number; sickName: string; coverName: string }): string {
  switch (scene) {
    case "availability":
      return d.revealed === 0 ? `Step 1 — ask the team what they can't work next week.` : d.revealed < d.count ? `💬 ${d.revealed} of ${d.count} replied…` : `✅ All ${d.count} replied. Ready to build the draft.`
    case "draft":
      return `Step 2 — Covrly built the draft. Reassign anyone, then publish.`
    case "publish":
      return `Step 3 — published & sent. Everyone has their shifts on WhatsApp.`
    case "sick":
      return d.sickStep >= 3 ? `✅ ${d.coverName} is covering ${d.sickName}'s shift.` : `Step 4 — a call-out, handled automatically.`
    case "done":
      return `All done — your café is live.`
  }
}

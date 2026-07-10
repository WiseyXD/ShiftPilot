// The copilot's tool registry. Read tools return compact text the LLM turns
// into an answer. Write tools are two-phase: `prepare` resolves fuzzy
// references into ids and renders a preview (used for confirm-first
// proposals); `execute` is self-sufficient (works from ids alone, so pending
// confirms and undo inverses can run it later) and goes through the SAME
// server actions the dashboard uses — no second door, guards included.

import { z } from "zod"
import { prisma } from "@/prisma/client"
import { inngest } from "@/lib/inngest/client"
import { getShiftStart, formatShiftDate } from "@/lib/scheduling/shift-date"
import { resolveNames } from "@/lib/scheduling/manager-rules"
import { getHoursDistribution } from "@/lib/analytics/kpis"
import { reassignShift } from "@/app/actions/edit-shift"
import { approveSchedule, manualGenerateSchedule } from "@/app/actions/schedule"
import { parseManagerRule, saveManagerRule, deleteManagerRule, type RuleDraft } from "@/app/actions/manager-rules"
import { createVacation, deleteVacation } from "@/app/actions/vacation"
import { createEmployee, updateEmployee, deleteEmployee } from "@/app/actions/employee"
import { weekStartFor, currentMonday, resolveShift, shiftLabel, chronologicalDay, DAY_LABELS, type ResolvableShift } from "./resolve"
import { buildInverse } from "./undo"
import type { AgentContext, InverseCall } from "./types"
import type { ConfirmTarget } from "./classify"

// ── Registry shapes ──────────────────────────────────────────────────────────

export interface ReadTool {
  kind: "read"
  description: string
  schema: z.ZodType
  run(ctx: AgentContext, params: never): Promise<string>
}

export interface PrepareResult {
  preview: string
  execParams: Record<string, unknown>
  target?: ConfirmTarget
}

export type ExecuteResult =
  | { error: string }
  // a soft conflict surfaced mid-execution → becomes a confirm-first proposal
  | { confirmFirst: { preview: string; execParams: Record<string, unknown> } }
  | { reply: string; inverse: InverseCall | null }

export interface WriteTool {
  kind: "write"
  description: string
  internal?: boolean // not exposed to the LLM (undo plumbing)
  schema: z.ZodType
  prepare(ctx: AgentContext, params: never): Promise<{ error: string } | PrepareResult>
  execute(ctx: AgentContext, execParams: Record<string, unknown>): Promise<ExecuteResult>
}

export type AgentTool = ReadTool | WriteTool

// ── Small helpers ────────────────────────────────────────────────────────────

// A missing Inngest dev server must not 500 the chat (same as the simulator).
async function safeSend(event: { name: string; data: Record<string, unknown> }) {
  try {
    await inngest.send(event)
  } catch (err) {
    console.error("inngest.send failed (copilot continues):", err)
  }
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })

type EmployeeRef = { error: string; id?: never; name?: never } | { error?: never; id: string; name: string }

async function findEmployeeByName(locationId: string, name: string): Promise<EmployeeRef> {
  const employees = await prisma.employee.findMany({
    where: { locationId },
    select: { id: true, name: true },
  })
  const resolved = resolveNames([name], employees)
  if (!resolved.ok) return { error: resolved.error }
  const match = employees.find((e) => e.id === resolved.ids[0])!
  return { id: match.id, name: match.name }
}

async function loadWeekShifts(locationId: string, weekStart: Date) {
  const schedule = await prisma.schedule.findFirst({
    where: { locationId, weekStart },
    orderBy: { createdAt: "desc" },
    include: {
      shifts: {
        include: {
          shiftTemplate: { select: { name: true, startTime: true, endTime: true } },
          employee: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!schedule) return null
  const shifts: ResolvableShift[] = schedule.shifts.map((s) => ({
    id: s.id,
    dayOfWeek: s.dayOfWeek,
    status: s.status,
    employeeId: s.employeeId,
    employeeName: s.employee?.name ?? null,
    templateName: s.shiftTemplate.name,
    startTime: s.shiftTemplate.startTime,
    endTime: s.shiftTemplate.endTime,
  }))
  return { schedule, shifts }
}

// Real calendar label for a shift ("Fri 18 Jul · Abend 17:00–23:00").
function realShiftLabel(weekStart: Date, s: ResolvableShift) {
  const start = getShiftStart(new Date(weekStart), s.dayOfWeek, s.startTime)
  return `${formatShiftDate(start)} · ${s.templateName} ${s.startTime}–${s.endTime}`
}

const STATUS_DE: Record<string, string> = {
  PENDING: "offen (unbestätigt)",
  ACCEPTED: "bestätigt",
  DECLINED: "abgesagt",
  REASSIGNED: "übernommen",
  UNASSIGNED: "NICHT BESETZT",
  LENT_OUT: "verliehen",
  NO_SHOW: "nicht erschienen",
}

const weekOffsetParam = z
  .number()
  .int()
  .min(-4)
  .max(8)
  .default(0)
  .describe("0 = current week, 1 = next week, -1 = last week")

const dayParam = z
  .number()
  .int()
  .min(0)
  .max(6)
  .describe("Day of week: 0=Sunday, 1=Monday … 6=Saturday")

// ── Read tools ───────────────────────────────────────────────────────────────

const getSchedule: ReadTool = {
  kind: "read",
  description:
    "Show the schedule for a week: every shift with day, time, assigned employee and status. Use this to answer who works when, or what's still open.",
  schema: z.object({ weekOffset: weekOffsetParam }),
  async run(ctx, params: { weekOffset: number }) {
    const weekStart = weekStartFor(params.weekOffset)
    const loaded = await loadWeekShifts(ctx.locationId, weekStart)
    if (!loaded) return `Für die Woche ab ${fmtDate(weekStart)} gibt es keinen Plan.`
    const lines = [...loaded.shifts]
      .sort((a, b) => chronologicalDay(a.dayOfWeek) - chronologicalDay(b.dayOfWeek) || a.startTime.localeCompare(b.startTime))
      .map((s) => `${realShiftLabel(weekStart, s)} — ${s.employeeName ?? "—"} [${STATUS_DE[s.status] ?? s.status}]`)
    return `Plan Woche ab ${fmtDate(weekStart)} (Status: ${loaded.schedule.status}):\n${lines.join("\n")}`
  },
}

const getHours: ReadTool = {
  kind: "read",
  description:
    "Hours report for a week: planned hours per employee vs contract and the binding legal maximum (ArbZG/JArbSchG/Minijob cap/Werkstudent). Use for questions about workload, Minijob caps or legal limits.",
  schema: z.object({ weekOffset: weekOffsetParam }),
  async run(ctx, params: { weekOffset: number }) {
    const weekStart = weekStartFor(params.weekOffset)
    const rows = await getHoursDistribution(ctx.locationId, weekStart)
    if (rows.length === 0) return "Keine Mitarbeitenden angelegt."
    const lines = rows.map((r) => {
      const flags = [
        r.status === "over" ? "❌ ÜBER dem Limit" : null,
        r.status !== "over" && r.approaching ? "⚠️ nähert sich dem Limit" : null,
        r.status === "under" ? "unter Mindeststunden" : null,
        r.weeksOverBudget ? `Werkstudent-Budget: ${r.weeksOverBudget.used}/${r.weeksOverBudget.budget} Wochen über 20h` : null,
      ].filter(Boolean)
      return `${r.name}: ${r.assignedHours}h geplant (Vertrag ${r.minHours}–${r.maxHours}h, bindendes Max ${Math.round(r.bindingMax.hours * 10) / 10}h laut ${r.bindingMax.source})${flags.length ? ` — ${flags.join("; ")}` : ""}`
    })
    return `Stunden Woche ab ${fmtDate(weekStart)}:\n${lines.join("\n")}`
  },
}

const getOpenShifts: ReadTool = {
  kind: "read",
  description: "List unassigned (open) shifts for a week.",
  schema: z.object({ weekOffset: weekOffsetParam }),
  async run(ctx, params: { weekOffset: number }) {
    const weekStart = weekStartFor(params.weekOffset)
    const loaded = await loadWeekShifts(ctx.locationId, weekStart)
    if (!loaded) return `Für die Woche ab ${fmtDate(weekStart)} gibt es keinen Plan.`
    const open = loaded.shifts.filter((s) => s.status === "UNASSIGNED")
    if (open.length === 0) return "Alle Schichten dieser Woche sind besetzt. 🎉"
    return `Offene Schichten:\n${open.map((s) => realShiftLabel(weekStart, s)).join("\n")}`
  },
}

const getUnconfirmedAvailability: ReadTool = {
  kind: "read",
  description:
    "Which Minijob employees have NOT yet confirmed their availability for a week (they get dropped from generation if unconfirmed).",
  schema: z.object({ weekOffset: weekOffsetParam.default(1) }),
  async run(ctx, params: { weekOffset: number }) {
    const weekStart = weekStartFor(params.weekOffset)
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
    const catA = await prisma.employee.findMany({
      where: { locationId: ctx.locationId, category: "MINIJOB_ZEITARBEIT" },
      select: { id: true, name: true },
    })
    if (catA.length === 0) return "Keine verfügbarkeitspflichtigen (Minijob-)Mitarbeitenden."
    const [confirmations, overrides] = await Promise.all([
      prisma.availabilityConfirmation.findMany({
        where: { weekStart, employeeId: { in: catA.map((e) => e.id) } },
        select: { employeeId: true },
      }),
      prisma.availabilityOverride.findMany({
        where: { date: { gte: weekStart, lt: weekEnd }, employeeId: { in: catA.map((e) => e.id) } },
        select: { employeeId: true },
      }),
    ])
    const confirmed = new Set([...confirmations, ...overrides].map((c) => c.employeeId))
    const missing = catA.filter((e) => !confirmed.has(e.id))
    if (missing.length === 0) return `Alle haben für die Woche ab ${fmtDate(weekStart)} bestätigt. ✅`
    return `Noch keine Bestätigung für die Woche ab ${fmtDate(weekStart)}: ${missing.map((e) => e.name).join(", ")}`
  },
}

const getOpenIssues: ReadTool = {
  kind: "read",
  description: "Open items needing the manager: unconfirmed sick calls and pending swap requests.",
  schema: z.object({}),
  async run(ctx) {
    const [sickCalls, swaps] = await Promise.all([
      prisma.sickCall.findMany({
        where: { locationId: ctx.locationId, confirmedAt: null },
        orderBy: { reportedAt: "desc" },
      }),
      prisma.swapRequest.findMany({
        where: { status: "PENDING", shift: { schedule: { locationId: ctx.locationId } } },
        include: { requester: { select: { name: true } } },
      }),
    ])
    const parts: string[] = []
    if (sickCalls.length > 0) {
      const employees = await prisma.employee.findMany({
        where: { id: { in: sickCalls.map((s) => s.employeeId) } },
        select: { id: true, name: true },
      })
      const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? "Unbekannt"
      parts.push(
        `Unbestätigte Krankmeldungen:\n${sickCalls.map((s) => `- ${nameOf(s.employeeId)} (gemeldet ${fmtDate(s.reportedAt)})`).join("\n")}`
      )
    }
    if (swaps.length > 0) {
      parts.push(`Offene Tauschanfragen:\n${swaps.map((s) => `- von ${s.requester.name}`).join("\n")}`)
    }
    return parts.length ? parts.join("\n\n") : "Nichts offen — alles erledigt. ✅"
  },
}

const listRules: ReadTool = {
  kind: "read",
  description: "List the manager's scheduling rules (with ids, needed for deleting one).",
  schema: z.object({}),
  async run(ctx) {
    const rules = await prisma.managerRule.findMany({
      where: { locationId: ctx.locationId },
      orderBy: { createdAt: "asc" },
    })
    if (rules.length === 0) return "Keine Regeln hinterlegt."
    return `Regeln:\n${rules.map((r) => `- ${r.plain} (id: ${r.id})`).join("\n")}`
  },
}

const listVacations: ReadTool = {
  kind: "read",
  description: "List vacations (optionally for one employee), with ids.",
  schema: z.object({ employeeName: z.string().optional() }),
  async run(ctx, params: { employeeName?: string }) {
    const where: { locationId: string; employeeId?: string } = { locationId: ctx.locationId }
    if (params.employeeName) {
      const emp = await findEmployeeByName(ctx.locationId, params.employeeName)
      if (emp.error !== undefined) return emp.error
      where.employeeId = emp.id
    }
    const vacations = await prisma.vacation.findMany({
      where,
      include: { employee: { select: { name: true } } },
      orderBy: { startDate: "asc" },
    })
    if (vacations.length === 0) return "Keine Urlaube eingetragen."
    return `Urlaube:\n${vacations
      .map((v) => `- ${v.employee.name}: ${fmtDate(v.startDate)}–${fmtDate(v.endDate)} (id: ${v.id})`)
      .join("\n")}`
  },
}

const listEmployees: ReadTool = {
  kind: "read",
  description: "The roster: every employee with category, roles, contract hours and wage.",
  schema: z.object({}),
  async run(ctx) {
    const employees = await prisma.employee.findMany({
      where: { locationId: ctx.locationId },
      orderBy: { name: "asc" },
    })
    if (employees.length === 0) return "Noch keine Mitarbeitenden angelegt."
    return employees
      .map((e) => {
        const bits = [
          e.category === "TEILZEIT_FEST" ? "Fest/Teilzeit" : "Minijob",
          e.roles.join("/") || null,
          `${e.minHours}–${e.maxHours}h`,
          e.hourlyWageCents ? `${(e.hourlyWageCents / 100).toFixed(2)}€/h` : null,
          e.isWerkstudent ? "Werkstudent" : null,
          e.birthDate ? `geb. ${fmtDate(e.birthDate)}` : null,
        ].filter(Boolean)
        return `- ${e.name} — ${bits.join(", ")}`
      })
      .join("\n")
  },
}

// ── Write tools ──────────────────────────────────────────────────────────────

// Shared by reassign/unassign: find the one shift the owner means.
type ShiftTarget =
  | { error: string; shift?: never; weekStart?: never; scheduleStatus?: never }
  | {
      error?: never
      weekStart: Date
      scheduleStatus: "DRAFT" | "APPROVED" | "PUBLISHED"
      shift: ResolvableShift
    }

async function resolveTargetShift(
  ctx: AgentContext,
  params: {
    weekOffset: number
    dayOfWeek?: number | null
    templateName?: string | null
    currentEmployeeName?: string | null
    preferUnassigned?: boolean
  }
): Promise<ShiftTarget> {
  const weekStart = weekStartFor(params.weekOffset)
  const loaded = await loadWeekShifts(ctx.locationId, weekStart)
  if (!loaded) return { error: `Für die Woche ab ${fmtDate(weekStart)} gibt es keinen Plan.` }
  const query = {
    dayOfWeek: params.dayOfWeek,
    templateName: params.templateName,
    employeeName: params.currentEmployeeName,
  }
  let result = resolveShift(loaded.shifts, query)
  // Assigning without naming who's replaced usually means the open slot.
  if (!result.ok && params.preferUnassigned && !params.currentEmployeeName) {
    const unassigned = resolveShift(loaded.shifts, { ...query, unassignedOnly: true })
    if (unassigned.ok) result = unassigned
  }
  if (!result.ok) return { error: result.error }
  return { weekStart, scheduleStatus: loaded.schedule.status, shift: result.shift }
}

const reassignShiftTool: WriteTool = {
  kind: "write",
  description:
    "Assign an employee to a shift (an open one, or replacing whoever holds it). Identify the shift by day of week, shift/template name and — when replacing someone — the current holder's name. Legal violations are hard-blocked; other conflicts ask the owner to override.",
  schema: z.object({
    employeeName: z.string().describe("Who should work the shift"),
    dayOfWeek: dayParam,
    templateName: z.string().optional().describe("Shift template name, e.g. 'Früh' or 'Abend'"),
    currentEmployeeName: z.string().optional().describe("Who currently holds the shift, when replacing"),
    weekOffset: weekOffsetParam,
  }),
  async prepare(ctx, params: { employeeName: string; dayOfWeek: number; templateName?: string; currentEmployeeName?: string; weekOffset: number }) {
    const emp = await findEmployeeByName(ctx.locationId, params.employeeName)
    if (emp.error !== undefined) return { error: emp.error }
    const target = await resolveTargetShift(ctx, { ...params, preferUnassigned: true })
    if (target.error !== undefined) return { error: target.error }
    return {
      preview: `${emp.name} übernimmt: ${realShiftLabel(target.weekStart, target.shift)}${target.shift.employeeName ? ` (statt ${target.shift.employeeName})` : ""}`,
      execParams: { shiftId: target.shift.id, employeeId: emp.id },
      target: { scheduleStatus: target.scheduleStatus },
    }
  },
  async execute(ctx, execParams) {
    const { shiftId, employeeId, override } = execParams as { shiftId: string; employeeId: string; override?: boolean }
    const [shift, employee] = await Promise.all([
      prisma.shift.findFirst({
        where: { id: shiftId, schedule: { location: { ownerId: ctx.userId } } },
        include: {
          employee: { select: { id: true, name: true } },
          shiftTemplate: { select: { name: true, startTime: true, endTime: true } },
          schedule: { select: { weekStart: true } },
        },
      }),
      prisma.employee.findFirst({ where: { id: employeeId, location: { ownerId: ctx.userId } } }),
    ])
    if (!shift || !employee) return { error: "Schicht oder Person nicht (mehr) gefunden." }
    const prior = { employeeId: shift.employeeId, employeeName: shift.employee?.name ?? null }
    const label = realShiftLabel(new Date(shift.schedule.weekStart), {
      id: shift.id,
      dayOfWeek: shift.dayOfWeek,
      status: shift.status,
      employeeId: shift.employeeId,
      employeeName: shift.employee?.name ?? null,
      templateName: shift.shiftTemplate.name,
      startTime: shift.shiftTemplate.startTime,
      endTime: shift.shiftTemplate.endTime,
    })

    const fd = new FormData()
    fd.set("shiftId", shiftId)
    fd.set("employeeId", employeeId)
    if (override) fd.set("override", "1")
    const result = await reassignShift(null, fd)

    if (result && "error" in result) return { error: result.error }
    if (result && "warning" in result) {
      return {
        confirmFirst: {
          preview: `⚠️ ${result.warning} — ${employee.name} trotzdem zuweisen (${label})?`,
          execParams: { shiftId, employeeId, override: true },
        },
      }
    }
    return {
      reply: `✅ ${employee.name} übernimmt: ${label}${prior.employeeName ? ` (statt ${prior.employeeName})` : ""}. Die Benachrichtigungen sind raus.`,
      inverse: buildInverse({ tool: "reassign_shift", params: { shiftId, employeeId }, prior }),
    }
  },
}

const unassignShiftTool: WriteTool = {
  kind: "write",
  description:
    "Take an employee off a shift, leaving it open. Identify the shift by the holder's name, day of week and optionally the shift/template name.",
  schema: z.object({
    employeeName: z.string().optional().describe("Who currently holds the shift"),
    dayOfWeek: dayParam.optional(),
    templateName: z.string().optional(),
    weekOffset: weekOffsetParam,
  }),
  async prepare(ctx, params: { employeeName?: string; dayOfWeek?: number; templateName?: string; weekOffset: number }) {
    const target = await resolveTargetShift(ctx, { ...params, currentEmployeeName: params.employeeName })
    if (target.error !== undefined) return { error: target.error }
    if (!target.shift.employeeId) return { error: "Diese Schicht ist gar nicht besetzt." }
    return {
      preview: `${target.shift.employeeName} von der Schicht nehmen: ${realShiftLabel(target.weekStart, target.shift)}`,
      execParams: { shiftId: target.shift.id },
      target: { scheduleStatus: target.scheduleStatus },
    }
  },
  async execute(ctx, execParams) {
    const { shiftId } = execParams as { shiftId: string }
    const shift = await prisma.shift.findFirst({
      where: { id: shiftId, schedule: { location: { ownerId: ctx.userId } } },
      include: {
        employee: { select: { id: true, name: true } },
        shiftTemplate: { select: { name: true, startTime: true, endTime: true } },
        schedule: { select: { weekStart: true } },
      },
    })
    if (!shift) return { error: "Schicht nicht (mehr) gefunden." }
    const prior = { employeeId: shift.employeeId, employeeName: shift.employee?.name ?? null }

    const fd = new FormData()
    fd.set("shiftId", shiftId)
    fd.set("employeeId", "")
    const result = await reassignShift(null, fd)
    if (result && "error" in result) return { error: result.error }
    return {
      reply: `✅ ${prior.employeeName ?? "Die Person"} ist von der Schicht runter — sie ist jetzt offen. Soll ich jemanden suchen? Sag einfach, wer übernehmen soll, oder frag nach offenen Schichten.`,
      inverse: buildInverse({ tool: "unassign_shift", params: { shiftId }, prior }),
    }
  },
}

const generateScheduleTool: WriteTool = {
  kind: "write",
  description: "Generate a new draft schedule for next week (runs the AI scheduler in the background).",
  schema: z.object({}),
  async prepare() {
    return { preview: "Neuen Wochenplan erstellen", execParams: {} }
  },
  async execute(ctx) {
    const result = await manualGenerateSchedule(ctx.locationId)
    if (result && "error" in result && typeof result.error === "string") {
      return { error: result.error }
    }
    return {
      reply: "🛠️ Ich erstelle den Entwurf — das dauert einen Moment. Ich melde mich hier, sobald er fertig ist.",
      inverse: null,
    }
  },
}

const publishScheduleTool: WriteTool = {
  kind: "write",
  description:
    "Approve & publish the current DRAFT schedule — every employee gets notified. Always requires the owner's confirmation.",
  schema: z.object({ weekOffset: weekOffsetParam.optional().nullable().describe("Omit to publish the latest draft") }),
  async prepare(ctx, params: { weekOffset?: number | null }) {
    const where: { locationId: string; status: "DRAFT"; weekStart?: Date } = {
      locationId: ctx.locationId,
      status: "DRAFT",
    }
    if (params.weekOffset != null) where.weekStart = weekStartFor(params.weekOffset)
    const schedule = await prisma.schedule.findFirst({
      where,
      orderBy: { weekStart: "desc" },
      include: { shifts: { select: { status: true } } },
    })
    if (!schedule) return { error: "Es gibt gerade keinen Entwurf zum Veröffentlichen." }
    const open = schedule.shifts.filter((s) => s.status === "UNASSIGNED").length
    return {
      preview: `Plan für die Woche ab ${fmtDate(schedule.weekStart)} veröffentlichen — ${schedule.shifts.length} Schichten${open > 0 ? `, davon ${open} noch offen` : ""}. Alle Mitarbeitenden werden benachrichtigt.`,
      execParams: { scheduleId: schedule.id, weekStart: schedule.weekStart.toISOString() },
      target: { scheduleStatus: schedule.status },
    }
  },
  async execute(ctx, execParams) {
    const { scheduleId } = execParams as { scheduleId: string }
    await approveSchedule(scheduleId, "")
    const after = await prisma.schedule.findFirst({
      where: { id: scheduleId, location: { ownerId: ctx.userId } },
      select: { status: true, weekStart: true },
    })
    if (!after || after.status === "DRAFT") {
      return { error: "Das hat nicht geklappt — ist der Entwurf noch da?" }
    }
    return {
      reply: `📣 Der Plan für die Woche ab ${fmtDate(after.weekStart)} ist raus! Alle Mitarbeitenden bekommen jetzt ihre Schichten. Ich sammle die Zu-/Absagen ein und melde mich bei Problemen.`,
      inverse: null,
    }
  },
}

const reportSickTool: WriteTool = {
  kind: "write",
  description:
    "Report an employee sick for one of their upcoming shifts: frees the shift and starts the automatic replacement search. Use dayOfWeek/weekOffset when they have several shifts.",
  schema: z.object({
    employeeName: z.string(),
    dayOfWeek: dayParam.optional(),
    weekOffset: weekOffsetParam,
  }),
  async prepare(ctx, params: { employeeName: string; dayOfWeek?: number; weekOffset: number }) {
    const emp = await findEmployeeByName(ctx.locationId, params.employeeName)
    if (emp.error !== undefined) return { error: emp.error }
    const shifts = await prisma.shift.findMany({
      where: {
        employeeId: emp.id,
        status: { in: ["PENDING", "ACCEPTED", "REASSIGNED"] },
        schedule: { locationId: ctx.locationId, weekStart: { gte: currentMonday() } },
        ...(params.dayOfWeek != null ? { dayOfWeek: params.dayOfWeek } : {}),
      },
      include: {
        shiftTemplate: { select: { name: true, startTime: true, endTime: true } },
        schedule: { select: { weekStart: true } },
      },
      orderBy: [{ schedule: { weekStart: "asc" } }, { dayOfWeek: "asc" }],
    })
    const inWeek = params.dayOfWeek != null || params.weekOffset !== 0
      ? shifts.filter((s) => s.schedule.weekStart.getTime() === weekStartFor(params.weekOffset).getTime())
      : shifts
    if (inWeek.length === 0) return { error: `${emp.name} hat keine passende anstehende Schicht.` }
    if (inWeek.length > 1) {
      const options = inWeek.map((s) =>
        realShiftLabel(new Date(s.schedule.weekStart), {
          id: s.id, dayOfWeek: s.dayOfWeek, status: s.status, employeeId: emp.id, employeeName: emp.name,
          templateName: s.shiftTemplate.name, startTime: s.shiftTemplate.startTime, endTime: s.shiftTemplate.endTime,
        })
      )
      return { error: `${emp.name} hat mehrere Schichten — welche? ${options.join("; ")}` }
    }
    const s = inWeek[0]
    return {
      preview: `${emp.name} krankmelden für ${realShiftLabel(new Date(s.schedule.weekStart), {
        id: s.id, dayOfWeek: s.dayOfWeek, status: s.status, employeeId: emp.id, employeeName: emp.name,
        templateName: s.shiftTemplate.name, startTime: s.shiftTemplate.startTime, endTime: s.shiftTemplate.endTime,
      })}`,
      execParams: { shiftId: s.id, employeeId: emp.id, employeeName: emp.name },
    }
  },
  async execute(ctx, execParams) {
    const { shiftId, employeeId } = execParams as { shiftId: string; employeeId: string }
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, location: { ownerId: ctx.userId } },
      select: { name: true },
    })
    if (!employee) return { error: "Person nicht gefunden." }
    // Same guarded transition as the token/simulator sick paths.
    const { count } = await prisma.shift.updateMany({
      where: {
        id: shiftId,
        employeeId,
        status: { in: ["PENDING", "ACCEPTED", "REASSIGNED"] },
        schedule: { location: { ownerId: ctx.userId } },
      },
      data: { status: "DECLINED" },
    })
    if (count === 0) return { error: "Die Schicht ist inzwischen schon anderweitig behandelt." }
    // Owner reported it → they obviously know; confirmedAt skips the nag loop.
    await prisma.sickCall.create({
      data: { locationId: ctx.locationId, shiftId, employeeId, confirmedAt: new Date() },
    })
    await safeSend({ name: "shift/sick-call", data: { shiftId } })
    return {
      reply: `🤒 Gute Besserung an ${employee.name}! Die Schicht ist freigegeben und ich suche schon nach Ersatz — ich melde mich, sobald jemand übernimmt.`,
      inverse: null,
    }
  },
}

const createRuleTool: WriteTool = {
  kind: "write",
  description:
    "Save a standing scheduling rule from natural language, e.g. 'Anna and Marco never together' or 'Ben prefers Saturdays'. The interpretation is read back for confirmation before saving.",
  schema: z.object({ text: z.string().describe("The rule, verbatim in the owner's words") }),
  async prepare(ctx, params: { text: string }) {
    const fd = new FormData()
    fd.set("locationId", ctx.locationId)
    fd.set("text", params.text)
    const parsed = await parseManagerRule(null, fd)
    if (!parsed) return { error: "Das konnte ich nicht als Regel lesen." }
    if ("error" in parsed) return { error: parsed.error }
    return {
      preview: `Neue Regel: „${parsed.draft.plain}“`,
      execParams: { draft: parsed.draft },
    }
  },
  async execute(ctx, execParams) {
    const draft = (execParams as { draft: RuleDraft }).draft
    await saveManagerRule(ctx.locationId, draft)
    const rule = await prisma.managerRule.findFirst({
      where: { locationId: ctx.locationId },
      orderBy: { createdAt: "desc" },
    })
    return {
      reply: `✅ Regel gespeichert: ${draft.plain} — sie gilt ab der nächsten Planerstellung.`,
      inverse: buildInverse({ tool: "create_rule", params: execParams, prior: { ruleId: rule?.id } }),
    }
  },
}

const deleteRuleTool: WriteTool = {
  kind: "write",
  description: "Delete a scheduling rule by id (get ids via list_rules).",
  schema: z.object({ ruleId: z.string() }),
  async prepare(ctx, params: { ruleId: string }) {
    const rule = await prisma.managerRule.findFirst({
      where: { id: params.ruleId, locationId: ctx.locationId },
    })
    if (!rule) return { error: "Diese Regel finde ich nicht." }
    return { preview: `Regel löschen: „${rule.plain}“`, execParams: { ruleId: params.ruleId } }
  },
  async execute(ctx, execParams) {
    const { ruleId } = execParams as { ruleId: string }
    const rule = await prisma.managerRule.findFirst({
      where: { id: ruleId, locationId: ctx.locationId },
    })
    if (!rule) return { error: "Diese Regel finde ich nicht (mehr)." }
    await deleteManagerRule(ruleId)
    return {
      reply: `🗑️ Regel gelöscht: „${rule.plain}“.`,
      inverse: buildInverse({
        tool: "delete_rule",
        params: execParams,
        prior: { kind: rule.kind, params: rule.params, sourceText: rule.sourceText, plain: rule.plain },
      }),
    }
  },
}

// Undo plumbing for delete_rule — not exposed to the LLM.
const restoreRuleTool: WriteTool = {
  kind: "write",
  internal: true,
  description: "Restore a previously deleted rule (undo plumbing).",
  schema: z.object({
    kind: z.enum(["NEVER_TOGETHER", "PREFER_DAY", "AVOID_DAY", "MAX_SHIFTS_PER_WEEK"]),
    params: z.record(z.string(), z.unknown()),
    sourceText: z.string(),
    plain: z.string(),
  }),
  async prepare(_ctx, params: { plain: string }) {
    return { preview: `Regel wiederherstellen: „${params.plain}“`, execParams: params as unknown as Record<string, unknown> }
  },
  async execute(ctx, execParams) {
    const p = execParams as { kind: RuleDraft["kind"]; params: { employeeIds?: string[]; dayOfWeek?: number | null; maxPerWeek?: number | null }; sourceText: string; plain: string }
    await saveManagerRule(ctx.locationId, {
      kind: p.kind,
      employeeIds: p.params.employeeIds ?? [],
      employeeNames: [],
      dayOfWeek: p.params.dayOfWeek ?? null,
      maxPerWeek: p.params.maxPerWeek ?? null,
      plain: p.plain,
      sourceText: p.sourceText,
    })
    return { reply: `✅ Regel wiederhergestellt: „${p.plain}“.`, inverse: null }
  },
}

const createVacationTool: WriteTool = {
  kind: "write",
  description:
    "Record a vacation/absence period for an employee. Colliding assigned shifts are freed and sent to the replacement engine automatically.",
  schema: z.object({
    employeeName: z.string().optional(),
    employeeId: z.string().optional().describe("Prefer employeeName; id is for internal use"),
    startDate: z.string().describe("YYYY-MM-DD"),
    endDate: z.string().describe("YYYY-MM-DD"),
  }),
  async prepare(ctx, params: { employeeName?: string; employeeId?: string; startDate: string; endDate: string }) {
    const emp = params.employeeId
      ? await prisma.employee.findFirst({ where: { id: params.employeeId, locationId: ctx.locationId }, select: { id: true, name: true } })
      : null
    const resolved = emp ?? (params.employeeName ? await findEmployeeByName(ctx.locationId, params.employeeName) : { error: "Für wen ist der Urlaub?" })
    if (!resolved || "error" in resolved) return { error: (resolved as { error: string })?.error ?? "Person nicht gefunden." }
    return {
      preview: `Urlaub für ${resolved.name}: ${params.startDate} bis ${params.endDate}`,
      execParams: { employeeId: resolved.id, employeeName: resolved.name, startDate: params.startDate, endDate: params.endDate },
    }
  },
  async execute(ctx, execParams) {
    const { employeeId, employeeName, startDate, endDate } = execParams as {
      employeeId: string; employeeName?: string; startDate: string; endDate: string
    }
    const fd = new FormData()
    fd.set("locationId", ctx.locationId)
    fd.set("employeeId", employeeId)
    fd.set("startDate", startDate)
    fd.set("endDate", endDate)
    const result = await createVacation(null, fd)
    if (result && "error" in result) return { error: result.error }
    const vacation = await prisma.vacation.findFirst({
      where: { employeeId, startDate: new Date(`${startDate}T00:00:00Z`) },
      orderBy: { createdAt: "desc" },
    })
    const warning = result && "warning" in result ? `\n⚠️ ${result.warning}` : ""
    return {
      reply: `🏖️ Urlaub eingetragen für ${employeeName ?? "die Person"}: ${startDate} bis ${endDate}.${warning}`,
      inverse: buildInverse({ tool: "create_vacation", params: execParams, prior: { vacationId: vacation?.id } }),
    }
  },
}

const deleteVacationTool: WriteTool = {
  kind: "write",
  description: "Delete a vacation entry — by id (see list_vacations) or by employee name when they only have one.",
  schema: z.object({
    vacationId: z.string().optional(),
    employeeName: z.string().optional(),
  }),
  async prepare(ctx, params: { vacationId?: string; employeeName?: string }) {
    let vacation = null
    if (params.vacationId) {
      vacation = await prisma.vacation.findFirst({
        where: { id: params.vacationId, locationId: ctx.locationId },
        include: { employee: { select: { name: true } } },
      })
    } else if (params.employeeName) {
      const emp = await findEmployeeByName(ctx.locationId, params.employeeName)
      if (emp.error !== undefined) return { error: emp.error }
      const all = await prisma.vacation.findMany({
        where: { employeeId: emp.id },
        include: { employee: { select: { name: true } } },
      })
      if (all.length > 1) return { error: `${emp.name} hat mehrere Urlaube — nutze list_vacations und gib die id an.` }
      vacation = all[0] ?? null
    }
    if (!vacation) return { error: "Diesen Urlaub finde ich nicht." }
    return {
      preview: `Urlaub löschen: ${vacation.employee.name}, ${fmtDate(vacation.startDate)}–${fmtDate(vacation.endDate)}`,
      execParams: { vacationId: vacation.id },
    }
  },
  async execute(ctx, execParams) {
    const { vacationId } = execParams as { vacationId: string }
    const vacation = await prisma.vacation.findFirst({
      where: { id: vacationId, location: { ownerId: ctx.userId } },
      include: { employee: { select: { name: true } } },
    })
    if (!vacation) return { error: "Diesen Urlaub finde ich nicht (mehr)." }
    await deleteVacation(vacationId)
    return {
      reply: `🗑️ Urlaub von ${vacation.employee.name} (${fmtDate(vacation.startDate)}–${fmtDate(vacation.endDate)}) gelöscht.`,
      inverse: buildInverse({
        tool: "delete_vacation",
        params: execParams,
        prior: {
          employeeId: vacation.employeeId,
          startDate: vacation.startDate.toISOString().slice(0, 10),
          endDate: vacation.endDate.toISOString().slice(0, 10),
        },
      }),
    }
  },
}

const createEmployeeTool: WriteTool = {
  kind: "write",
  description:
    "Add a new employee to the roster. Email is required for shift notifications — ask the owner for it if missing.",
  schema: z.object({
    name: z.string(),
    email: z.string().describe("Required — ask the owner if they didn't give one"),
    roles: z.array(z.string()).default([]),
    category: z.enum(["MINIJOB_ZEITARBEIT", "TEILZEIT_FEST"]).default("MINIJOB_ZEITARBEIT"),
    hourlyWage: z.number().optional().describe("EUR per hour, e.g. 13.9"),
    birthDate: z.string().optional().describe("YYYY-MM-DD — important for minors (JArbSchG)"),
    phone: z.string().optional(),
    minHours: z.number().int().min(0).default(0),
    maxHours: z.number().int().min(1).default(40),
    isWerkstudent: z.boolean().default(false),
  }),
  async prepare(_ctx, params: { name: string; category: string }) {
    return {
      preview: `${params.name} anlegen (${params.category === "TEILZEIT_FEST" ? "Fest/Teilzeit" : "Minijob"})`,
      execParams: params as unknown as Record<string, unknown>,
    }
  },
  async execute(ctx, execParams) {
    const p = execParams as {
      name: string; email: string; roles?: string[]; category?: string; hourlyWage?: number
      birthDate?: string; phone?: string; minHours?: number; maxHours?: number; isWerkstudent?: boolean
    }
    const fd = new FormData()
    fd.set("locationId", ctx.locationId)
    fd.set("name", p.name)
    fd.set("email", p.email)
    for (const role of p.roles ?? []) fd.append("roles", role)
    fd.set("minHours", String(p.minHours ?? 0))
    fd.set("maxHours", String(p.maxHours ?? 40))
    fd.set("category", p.category ?? "MINIJOB_ZEITARBEIT")
    if (p.birthDate) fd.set("birthDate", p.birthDate)
    if (p.phone) fd.set("phone", p.phone)
    if (p.hourlyWage != null) fd.set("hourlyWage", String(p.hourlyWage))
    if (p.isWerkstudent) fd.set("isWerkstudent", "on")
    const result = await createEmployee(null, fd)
    if (result && "error" in result) return { error: result.error }
    const created = await prisma.employee.findFirst({
      where: { locationId: ctx.locationId, email: p.email.toLowerCase() },
      select: { id: true, name: true },
    })
    return {
      reply: `✅ ${p.name} ist im Team! Sag Bescheid, wenn ich die Verfügbarkeits-Abfrage per E-Mail schicken soll.`,
      inverse: buildInverse({ tool: "create_employee", params: execParams, prior: { employeeId: created?.id, name: created?.name } }),
    }
  },
}

const updateEmployeeTool: WriteTool = {
  kind: "write",
  description:
    "Update an employee's data: wage, roles, contract hours, category, birth date, phone. Only pass the fields that change.",
  schema: z.object({
    employeeName: z.string().optional(),
    employeeId: z.string().optional().describe("Prefer employeeName; id is for internal use"),
    fields: z.object({
      name: z.string().optional(),
      roles: z.array(z.string()).optional(),
      minHours: z.number().int().optional(),
      maxHours: z.number().int().optional(),
      category: z.enum(["MINIJOB_ZEITARBEIT", "TEILZEIT_FEST"]).optional(),
      hourlyWage: z.number().nullable().optional().describe("EUR per hour"),
      birthDate: z.string().nullable().optional().describe("YYYY-MM-DD"),
      phone: z.string().nullable().optional(),
      isWerkstudent: z.boolean().optional(),
      lectureFree: z.boolean().optional(),
      wishWeight: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    }),
  }),
  async prepare(ctx, params: { employeeName?: string; employeeId?: string; fields: Record<string, unknown> }) {
    const emp = params.employeeId
      ? await prisma.employee.findFirst({ where: { id: params.employeeId, locationId: ctx.locationId }, select: { id: true, name: true } })
      : params.employeeName
        ? await findEmployeeByName(ctx.locationId, params.employeeName)
        : { error: "Wen soll ich ändern?" }
    if (!emp || "error" in emp) return { error: (emp as { error: string })?.error ?? "Person nicht gefunden." }
    const changes = Object.entries(params.fields)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k} → ${Array.isArray(v) ? v.join("/") : String(v)}`)
    if (changes.length === 0) return { error: "Was genau soll ich ändern?" }
    return {
      preview: `${emp.name} ändern: ${changes.join(", ")}`,
      execParams: { employeeId: emp.id, fields: params.fields },
    }
  },
  async execute(ctx, execParams) {
    const { employeeId, fields } = execParams as {
      employeeId: string
      fields: {
        name?: string; roles?: string[]; minHours?: number; maxHours?: number
        category?: "MINIJOB_ZEITARBEIT" | "TEILZEIT_FEST"; hourlyWage?: number | null
        birthDate?: string | null; phone?: string | null
        isWerkstudent?: boolean; lectureFree?: boolean; wishWeight?: "LOW" | "MEDIUM" | "HIGH"
      }
    }
    const current = await prisma.employee.findFirst({
      where: { id: employeeId, location: { ownerId: ctx.userId } },
    })
    if (!current) return { error: "Person nicht gefunden." }

    // Prior snapshot of exactly the fields being touched — powers the inverse.
    const prior: Record<string, unknown> = {}
    for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
      if (fields[key] === undefined) continue
      switch (key) {
        case "hourlyWage":
          prior[key] = current.hourlyWageCents == null ? null : current.hourlyWageCents / 100
          break
        case "birthDate":
          prior[key] = current.birthDate ? current.birthDate.toISOString().slice(0, 10) : null
          break
        default:
          prior[key] = current[key as keyof typeof current]
      }
    }

    const merged = {
      name: fields.name ?? current.name,
      roles: fields.roles ?? current.roles,
      minHours: fields.minHours ?? current.minHours,
      maxHours: fields.maxHours ?? current.maxHours,
      category: fields.category ?? current.category,
      hourlyWage:
        fields.hourlyWage !== undefined
          ? fields.hourlyWage
          : current.hourlyWageCents == null
            ? null
            : current.hourlyWageCents / 100,
      birthDate:
        fields.birthDate !== undefined
          ? fields.birthDate
          : current.birthDate
            ? current.birthDate.toISOString().slice(0, 10)
            : null,
      phone: fields.phone !== undefined ? fields.phone : current.phone,
      isWerkstudent: fields.isWerkstudent ?? current.isWerkstudent,
      lectureFree: fields.lectureFree ?? current.lectureFree,
      wishWeight: fields.wishWeight ?? current.wishWeight,
    }

    const fd = new FormData()
    fd.set("employeeId", employeeId)
    fd.set("name", merged.name)
    for (const role of merged.roles) fd.append("roles", role)
    fd.set("minHours", String(merged.minHours))
    fd.set("maxHours", String(merged.maxHours))
    fd.set("category", merged.category)
    if (merged.birthDate) fd.set("birthDate", merged.birthDate)
    if (merged.phone) fd.set("phone", merged.phone)
    if (merged.hourlyWage != null) fd.set("hourlyWage", String(merged.hourlyWage))
    if (merged.isWerkstudent) fd.set("isWerkstudent", "on")
    if (merged.lectureFree) fd.set("lectureFree", "on")
    fd.set("wishWeight", merged.wishWeight)
    const result = await updateEmployee(null, fd)
    if (result && "error" in result) return { error: result.error }
    return {
      reply: `✅ ${merged.name} ist aktualisiert.`,
      inverse: buildInverse({ tool: "update_employee", params: execParams, prior: { fields: prior } }),
    }
  },
}

const deleteEmployeeTool: WriteTool = {
  kind: "write",
  description:
    "Remove an employee from the roster permanently (availability, tokens and shift assignments go with them). Always requires the owner's confirmation and cannot be undone.",
  schema: z.object({
    employeeName: z.string().optional(),
    employeeId: z.string().optional().describe("Prefer employeeName; id is for internal use"),
  }),
  async prepare(ctx, params: { employeeName?: string; employeeId?: string }) {
    const emp = params.employeeId
      ? await prisma.employee.findFirst({ where: { id: params.employeeId, locationId: ctx.locationId }, select: { id: true, name: true } })
      : params.employeeName
        ? await findEmployeeByName(ctx.locationId, params.employeeName)
        : { error: "Wen soll ich entfernen?" }
    if (!emp || "error" in emp) return { error: (emp as { error: string })?.error ?? "Person nicht gefunden." }
    const upcoming = await prisma.shift.count({
      where: {
        employeeId: emp.id,
        status: { in: ["PENDING", "ACCEPTED", "REASSIGNED"] },
        schedule: { weekStart: { gte: currentMonday() } },
      },
    })
    return {
      preview: `${emp.name} ENDGÜLTIG aus dem Team entfernen${upcoming > 0 ? ` — ${upcoming} anstehende Schicht(en) werden frei` : ""}. Das kann ich nicht rückgängig machen.`,
      execParams: { employeeId: emp.id, name: emp.name },
    }
  },
  async execute(ctx, execParams) {
    const { employeeId, name } = execParams as { employeeId: string; name?: string }
    await deleteEmployee(employeeId)
    const still = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } })
    if (still) return { error: "Das hat nicht geklappt — die Person ist noch da." }
    return { reply: `🗑️ ${name ?? "Die Person"} wurde aus dem Team entfernt.`, inverse: null }
  },
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const TOOLS: Record<string, AgentTool> = {
  get_schedule: getSchedule,
  get_hours: getHours,
  get_open_shifts: getOpenShifts,
  get_unconfirmed_availability: getUnconfirmedAvailability,
  get_open_issues: getOpenIssues,
  list_rules: listRules,
  list_vacations: listVacations,
  list_employees: listEmployees,
  reassign_shift: reassignShiftTool,
  unassign_shift: unassignShiftTool,
  generate_schedule: generateScheduleTool,
  publish_schedule: publishScheduleTool,
  report_sick: reportSickTool,
  create_rule: createRuleTool,
  delete_rule: deleteRuleTool,
  restore_rule: restoreRuleTool,
  create_vacation: createVacationTool,
  delete_vacation: deleteVacationTool,
  create_employee: createEmployeeTool,
  update_employee: updateEmployeeTool,
  delete_employee: deleteEmployeeTool,
}

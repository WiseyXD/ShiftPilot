// The copilot's tool registry. Read tools return compact text the LLM turns
// into an answer. Write tools are two-phase: `prepare` resolves fuzzy
// references into ids and renders a preview (used for confirm-first
// proposals); `execute` is self-sufficient (works from ids alone, so pending
// confirms and undo inverses can run it later) and goes through the SAME
// server actions the dashboard uses — no second door, guards included.

import { z } from "zod"
import { prisma } from "@/prisma/client"
import { inngest } from "@/lib/inngest/client"
import { getShiftStart } from "@/lib/scheduling/shift-date"
import { resolveNames } from "@/lib/scheduling/manager-rules"
import { getHoursDistribution } from "@/lib/analytics/kpis"
import { reassignShift } from "@/app/actions/edit-shift"
import { approveSchedule, manualGenerateSchedule } from "@/app/actions/schedule"
import { parseManagerRule, saveManagerRule, deleteManagerRule, type RuleDraft } from "@/app/actions/manager-rules"
import { createVacation, deleteVacation } from "@/app/actions/vacation"
import { createEmployee, updateEmployee, deleteEmployee } from "@/app/actions/employee"
import { weekStartFor, currentMonday, resolveShift, shiftLabel, chronologicalDay, type ResolvableShift } from "./resolve"
import { buildInverse } from "./undo"
import { t, fmtDate, fmtDay, type Lang } from "./i18n"
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

// Read-tool outputs are always English: they only feed the LLM, which answers
// in the owner's language. Write-tool previews/replies are pushed verbatim,
// so those use the owner's language via t(ctx.lang).
const fmtDateEn = (d: Date) => fmtDate("en", d)

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
function realShiftLabel(lang: Lang, weekStart: Date, s: ResolvableShift) {
  const start = getShiftStart(new Date(weekStart), s.dayOfWeek, s.startTime)
  return `${fmtDay(lang, start)} · ${s.templateName} ${s.startTime}–${s.endTime}`
}

const STATUS_EN: Record<string, string> = {
  PENDING: "pending (unconfirmed)",
  ACCEPTED: "confirmed",
  DECLINED: "declined",
  REASSIGNED: "covered",
  UNASSIGNED: "UNASSIGNED",
  LENT_OUT: "lent out",
  NO_SHOW: "no-show",
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
    if (!loaded) return `There is no schedule for the week starting ${fmtDateEn(weekStart)}.`
    const lines = [...loaded.shifts]
      .sort((a, b) => chronologicalDay(a.dayOfWeek) - chronologicalDay(b.dayOfWeek) || a.startTime.localeCompare(b.startTime))
      .map((s) => `${realShiftLabel("en", weekStart, s)} — ${s.employeeName ?? "—"} [${STATUS_EN[s.status] ?? s.status}]`)
    return `Schedule for the week starting ${fmtDateEn(weekStart)} (status: ${loaded.schedule.status}):\n${lines.join("\n")}`
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
    if (rows.length === 0) return "No employees yet."
    const lines = rows.map((r) => {
      const flags = [
        r.status === "over" ? "❌ OVER the limit" : null,
        r.status !== "over" && r.approaching ? "⚠️ approaching the limit" : null,
        r.status === "under" ? "below contract minimum" : null,
        r.weeksOverBudget ? `Werkstudent budget: ${r.weeksOverBudget.used}/${r.weeksOverBudget.budget} weeks over 20h` : null,
      ].filter(Boolean)
      return `${r.name}: ${r.assignedHours}h planned (contract ${r.minHours}–${r.maxHours}h, binding max ${Math.round(r.bindingMax.hours * 10) / 10}h per ${r.bindingMax.source})${flags.length ? ` — ${flags.join("; ")}` : ""}`
    })
    return `Hours for the week starting ${fmtDateEn(weekStart)}:\n${lines.join("\n")}`
  },
}

const getOpenShifts: ReadTool = {
  kind: "read",
  description: "List unassigned (open) shifts for a week.",
  schema: z.object({ weekOffset: weekOffsetParam }),
  async run(ctx, params: { weekOffset: number }) {
    const weekStart = weekStartFor(params.weekOffset)
    const loaded = await loadWeekShifts(ctx.locationId, weekStart)
    if (!loaded) return `There is no schedule for the week starting ${fmtDateEn(weekStart)}.`
    const open = loaded.shifts.filter((s) => s.status === "UNASSIGNED")
    if (open.length === 0) return "Every shift that week is covered. 🎉"
    return `Open shifts:\n${open.map((s) => realShiftLabel("en", weekStart, s)).join("\n")}`
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
    if (catA.length === 0) return "No availability-bound (minijob) employees."
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
    if (missing.length === 0) return `Everyone has confirmed for the week starting ${fmtDateEn(weekStart)}. ✅`
    return `Not yet confirmed for the week starting ${fmtDateEn(weekStart)}: ${missing.map((e) => e.name).join(", ")}`
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
      const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? "Unknown"
      parts.push(
        `Unconfirmed sick calls:\n${sickCalls.map((s) => `- ${nameOf(s.employeeId)} (reported ${fmtDateEn(s.reportedAt)})`).join("\n")}`
      )
    }
    if (swaps.length > 0) {
      parts.push(`Pending swap requests:\n${swaps.map((s) => `- from ${s.requester.name}`).join("\n")}`)
    }
    return parts.length ? parts.join("\n\n") : "Nothing open — all handled. ✅"
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
    if (rules.length === 0) return "No rules saved."
    return `Rules:\n${rules.map((r) => `- ${r.plain} (id: ${r.id})`).join("\n")}`
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
    if (vacations.length === 0) return "No vacations recorded."
    return `Vacations:\n${vacations
      .map((v) => `- ${v.employee.name}: ${fmtDateEn(v.startDate)}–${fmtDateEn(v.endDate)} (id: ${v.id})`)
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
    if (employees.length === 0) return "No employees yet."
    return employees
      .map((e) => {
        const bits = [
          e.category === "TEILZEIT_FEST" ? "part/full-time" : "minijob",
          e.roles.join("/") || null,
          `${e.minHours}–${e.maxHours}h`,
          e.hourlyWageCents ? `${(e.hourlyWageCents / 100).toFixed(2)}€/h` : null,
          e.isWerkstudent ? "Werkstudent" : null,
          e.birthDate ? `born ${fmtDateEn(e.birthDate)}` : null,
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
  if (!loaded) return { error: t(ctx.lang).noPlanForWeek(fmtDate(ctx.lang, weekStart)) }
  const query = {
    dayOfWeek: params.dayOfWeek,
    templateName: params.templateName,
    employeeName: params.currentEmployeeName,
  }
  let result = resolveShift(loaded.shifts, query, ctx.lang)
  // Assigning without naming who's replaced usually means the open slot.
  if (!result.ok && params.preferUnassigned && !params.currentEmployeeName) {
    const unassigned = resolveShift(loaded.shifts, { ...query, unassignedOnly: true }, ctx.lang)
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
    const tr = t(ctx.lang)
    return {
      preview: `${tr.takesOver(emp.name, realShiftLabel(ctx.lang, target.weekStart, target.shift))}${target.shift.employeeName ? tr.insteadOf(target.shift.employeeName) : ""}`,
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
    const tr = t(ctx.lang)
    if (!shift || !employee) return { error: tr.shiftOrPersonGone }
    const prior = { employeeId: shift.employeeId, employeeName: shift.employee?.name ?? null }
    const label = realShiftLabel(ctx.lang, new Date(shift.schedule.weekStart), {
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
          preview: tr.overrideAnyway(result.warning, employee.name, label),
          execParams: { shiftId, employeeId, override: true },
        },
      }
    }
    return {
      reply: tr.reassigned(employee.name, label, prior.employeeName),
      inverse: buildInverse({ tool: "reassign_shift", params: { shiftId, employeeId }, prior }, ctx.lang),
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
    const tr = t(ctx.lang)
    if (!target.shift.employeeId) return { error: tr.shiftNotAssigned }
    return {
      preview: tr.takeOffShift(target.shift.employeeName ?? "?", realShiftLabel(ctx.lang, target.weekStart, target.shift)),
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
    const tr = t(ctx.lang)
    if (!shift) return { error: tr.shiftGone }
    const prior = { employeeId: shift.employeeId, employeeName: shift.employee?.name ?? null }

    const fd = new FormData()
    fd.set("shiftId", shiftId)
    fd.set("employeeId", "")
    const result = await reassignShift(null, fd)
    if (result && "error" in result) return { error: result.error }
    return {
      reply: tr.unassigned(prior.employeeName ?? tr.somebody),
      inverse: buildInverse({ tool: "unassign_shift", params: { shiftId }, prior }, ctx.lang),
    }
  },
}

const generateScheduleTool: WriteTool = {
  kind: "write",
  description: "Generate a new draft schedule for next week (runs the AI scheduler in the background).",
  schema: z.object({}),
  async prepare(ctx) {
    return { preview: t(ctx.lang).generateDraft, execParams: {} }
  },
  async execute(ctx) {
    const result = await manualGenerateSchedule(ctx.locationId)
    if (result && "error" in result && typeof result.error === "string") {
      return { error: result.error }
    }
    return { reply: t(ctx.lang).generating, inverse: null }
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
    if (!schedule) return { error: t(ctx.lang).noDraftToPublish }
    const open = schedule.shifts.filter((s) => s.status === "UNASSIGNED").length
    return {
      preview: t(ctx.lang).publishPreview(fmtDate(ctx.lang, schedule.weekStart), schedule.shifts.length, open),
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
      return { error: t(ctx.lang).publishFailed }
    }
    return { reply: t(ctx.lang).published(fmtDate(ctx.lang, after.weekStart)), inverse: null }
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
    const tr = t(ctx.lang)
    const inWeek = params.dayOfWeek != null || params.weekOffset !== 0
      ? shifts.filter((s) => s.schedule.weekStart.getTime() === weekStartFor(params.weekOffset).getTime())
      : shifts
    if (inWeek.length === 0) return { error: tr.noUpcomingShift(emp.name) }
    const label = (s: (typeof inWeek)[number]) =>
      realShiftLabel(ctx.lang, new Date(s.schedule.weekStart), {
        id: s.id, dayOfWeek: s.dayOfWeek, status: s.status, employeeId: emp.id, employeeName: emp.name,
        templateName: s.shiftTemplate.name, startTime: s.shiftTemplate.startTime, endTime: s.shiftTemplate.endTime,
      })
    if (inWeek.length > 1) {
      return { error: tr.whichShiftSick(emp.name, inWeek.map(label).join("; ")) }
    }
    const s = inWeek[0]
    return {
      preview: tr.sickPreview(emp.name, label(s)),
      execParams: { shiftId: s.id, employeeId: emp.id, employeeName: emp.name },
    }
  },
  async execute(ctx, execParams) {
    const { shiftId, employeeId } = execParams as { shiftId: string; employeeId: string }
    const tr = t(ctx.lang)
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, location: { ownerId: ctx.userId } },
      select: { name: true },
    })
    if (!employee) return { error: tr.personNotFound }
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
    if (count === 0) return { error: tr.shiftAlreadyHandled }
    // Owner reported it → they obviously know; confirmedAt skips the nag loop.
    await prisma.sickCall.create({
      data: { locationId: ctx.locationId, shiftId, employeeId, confirmedAt: new Date() },
    })
    await safeSend({ name: "shift/sick-call", data: { shiftId } })
    return { reply: tr.sickReported(employee.name), inverse: null }
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
    if (!parsed) return { error: t(ctx.lang).couldNotParseRule }
    if ("error" in parsed) return { error: parsed.error }
    return {
      preview: t(ctx.lang).newRule(parsed.draft.plain),
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
      reply: t(ctx.lang).ruleSaved(draft.plain),
      inverse: buildInverse({ tool: "create_rule", params: execParams, prior: { ruleId: rule?.id } }, ctx.lang),
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
    if (!rule) return { error: t(ctx.lang).ruleNotFound }
    return { preview: t(ctx.lang).deleteRulePreview(rule.plain), execParams: { ruleId: params.ruleId } }
  },
  async execute(ctx, execParams) {
    const { ruleId } = execParams as { ruleId: string }
    const rule = await prisma.managerRule.findFirst({
      where: { id: ruleId, locationId: ctx.locationId },
    })
    if (!rule) return { error: t(ctx.lang).ruleNotFoundAnymore }
    await deleteManagerRule(ruleId)
    return {
      reply: t(ctx.lang).ruleDeleted(rule.plain),
      inverse: buildInverse(
        {
          tool: "delete_rule",
          params: execParams,
          prior: { kind: rule.kind, params: rule.params, sourceText: rule.sourceText, plain: rule.plain },
        },
        ctx.lang
      ),
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
  async prepare(ctx, params: { plain: string }) {
    return { preview: t(ctx.lang).restoreRulePreview(params.plain), execParams: params as unknown as Record<string, unknown> }
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
    return { reply: t(ctx.lang).ruleRestored(p.plain), inverse: null }
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
    const tr = t(ctx.lang)
    const resolved = emp ?? (params.employeeName ? await findEmployeeByName(ctx.locationId, params.employeeName) : { error: tr.whoseVacation })
    if (!resolved || "error" in resolved) return { error: (resolved as { error: string })?.error ?? tr.personNotFound }
    return {
      preview: tr.vacationPreview(resolved.name!, params.startDate, params.endDate),
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
    const tr = t(ctx.lang)
    const warning = result && "warning" in result ? `\n⚠️ ${result.warning}` : ""
    return {
      reply: `${tr.vacationSaved(employeeName ?? tr.somebody, startDate, endDate)}${warning}`,
      inverse: buildInverse({ tool: "create_vacation", params: execParams, prior: { vacationId: vacation?.id } }, ctx.lang),
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
    const tr = t(ctx.lang)
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
      if (all.length > 1) return { error: tr.severalVacations(emp.name) }
      vacation = all[0] ?? null
    }
    if (!vacation) return { error: tr.vacationNotFound }
    return {
      preview: tr.deleteVacationPreview(
        vacation.employee.name,
        `${fmtDate(ctx.lang, vacation.startDate)}–${fmtDate(ctx.lang, vacation.endDate)}`
      ),
      execParams: { vacationId: vacation.id },
    }
  },
  async execute(ctx, execParams) {
    const { vacationId } = execParams as { vacationId: string }
    const tr = t(ctx.lang)
    const vacation = await prisma.vacation.findFirst({
      where: { id: vacationId, location: { ownerId: ctx.userId } },
      include: { employee: { select: { name: true } } },
    })
    if (!vacation) return { error: tr.vacationNotFoundAnymore }
    await deleteVacation(vacationId)
    return {
      reply: tr.vacationDeleted(
        vacation.employee.name,
        `${fmtDate(ctx.lang, vacation.startDate)}–${fmtDate(ctx.lang, vacation.endDate)}`
      ),
      inverse: buildInverse(
        {
          tool: "delete_vacation",
          params: execParams,
          prior: {
            employeeId: vacation.employeeId,
            startDate: vacation.startDate.toISOString().slice(0, 10),
            endDate: vacation.endDate.toISOString().slice(0, 10),
          },
        },
        ctx.lang
      ),
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
  async prepare(ctx, params: { name: string; category: string }) {
    const tr = t(ctx.lang)
    return {
      preview: tr.createEmployeePreview(params.name, tr.categoryLabel(params.category)),
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
      reply: t(ctx.lang).employeeCreated(p.name),
      inverse: buildInverse(
        { tool: "create_employee", params: execParams, prior: { employeeId: created?.id, name: created?.name } },
        ctx.lang
      ),
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
    const tr = t(ctx.lang)
    const emp = params.employeeId
      ? await prisma.employee.findFirst({ where: { id: params.employeeId, locationId: ctx.locationId }, select: { id: true, name: true } })
      : params.employeeName
        ? await findEmployeeByName(ctx.locationId, params.employeeName)
        : { error: tr.whoToChange }
    if (!emp || "error" in emp) return { error: (emp as { error: string })?.error ?? tr.personNotFound }
    const changes = Object.entries(params.fields)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k} → ${Array.isArray(v) ? v.join("/") : String(v)}`)
    if (changes.length === 0) return { error: tr.whatToChange }
    return {
      preview: tr.changePreview(emp.name!, changes.join(", ")),
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
    if (!current) return { error: t(ctx.lang).personNotFound }

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
      reply: t(ctx.lang).employeeUpdated(merged.name),
      inverse: buildInverse({ tool: "update_employee", params: execParams, prior: { fields: prior } }, ctx.lang),
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
    const tr = t(ctx.lang)
    const emp = params.employeeId
      ? await prisma.employee.findFirst({ where: { id: params.employeeId, locationId: ctx.locationId }, select: { id: true, name: true } })
      : params.employeeName
        ? await findEmployeeByName(ctx.locationId, params.employeeName)
        : { error: tr.whoToRemove }
    if (!emp || "error" in emp) return { error: (emp as { error: string })?.error ?? tr.personNotFound }
    const upcoming = await prisma.shift.count({
      where: {
        employeeId: emp.id,
        status: { in: ["PENDING", "ACCEPTED", "REASSIGNED"] },
        schedule: { weekStart: { gte: currentMonday() } },
      },
    })
    return {
      preview: tr.deleteEmployeePreview(emp.name!, upcoming),
      execParams: { employeeId: emp.id, name: emp.name },
    }
  },
  async execute(ctx, execParams) {
    const { employeeId, name } = execParams as { employeeId: string; name?: string }
    const tr = t(ctx.lang)
    await deleteEmployee(employeeId)
    const still = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } })
    if (still) return { error: tr.deleteFailed }
    return { reply: tr.employeeDeleted(name ?? tr.somebody), inverse: null }
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

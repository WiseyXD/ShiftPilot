import { prisma } from "@/prisma/client"
import { generateToken } from "@/lib/tokens/generate"
import { sendEmail } from "@/lib/email/send"
import { rankReplacementCandidates } from "@/lib/scheduling/replacement"
import { getShiftStart, getShiftEnd } from "@/lib/scheduling/shift-date"
import {
  checkEmployeeAssignment,
  type ComplianceViolation,
  type PlannedShift,
} from "@/lib/compliance/check"
import { loadRules } from "@/lib/compliance/load"
import type { ComplianceRules } from "@/lib/compliance/rules"
import type { Prisma } from "@/prisma/generated/client/client"
import * as React from "react"

type LoadedEmployee = Prisma.EmployeeGetPayload<{ include: { recurringAvailability: true } }>

// Minimal structural type for Inngest's step. We only use these two methods;
// keeping the type narrow avoids dragging in the rest of Inngest's type graph.
// Note: Inngest's `step.run` returns `Promise<Jsonify<T>>`, so we widen to
// `Promise<unknown>` here — the outreach loop doesn't use step.run's return
// value (every call is for side-effects only). Callers' own step.run calls in
// the workflow handlers continue to use Inngest's typed return.
export interface StepLike {
  run(id: string, fn: () => Promise<unknown> | unknown): Promise<unknown>
  waitForEvent(
    id: string,
    opts: { event: string; match?: string; timeout: string }
  ): Promise<{ data: Record<string, unknown> } | null>
}

export interface OutreachCandidate {
  employeeId: string
  email: string
  name: string
  priority: number
  fairnessScore: number
}

interface OutreachUrls {
  acceptUrl: string
  declineUrl: string
}

export interface OutreachConfig {
  step: StepLike
  locationId: string
  shiftId: string
  // employeeId of whoever is yielding the shift (declined employee or swap requester)
  offeredBy: string

  // Which field on the swap/response event payload identifies "this loop's response".
  // Replacement engine uses data.shiftId; swap broker uses data.swapRequestId.
  matchKey: "data.shiftId" | "data.swapRequestId"

  // Extra fields injected into both ACCEPT_SWAP and DECLINE_SWAP token payloads,
  // e.g. { swapRequestId } so the swap broker's match key resolves.
  extraTokenPayload?: Record<string, string>

  candidates: OutreachCandidate[]
  timeoutHours: number

  // Build the email content for one candidate. Invoked inside step.run.
  buildOutreach: (
    candidate: OutreachCandidate,
    urls: OutreachUrls
  ) =>
    | { subject: string; react: React.ReactElement }
    | Promise<{ subject: string; react: React.ReactElement }>

  // Called when a candidate accepts. Owns the reassignment side-effects and any
  // post-accept logic (e.g. swap broker's pre/post-freeze branch, manager wait).
  // Return "completed" to stop the loop; "continue" to try the next candidate.
  onAccept: (candidate: OutreachCandidate) => Promise<{ outcome: "completed" | "continue" }>

  // Audit action names. Stay as strings until the audit recorder is deepened.
  outreachAction: string
  declinedAction: string
}

export interface OutreachResult {
  accepted: boolean
  acceptedCandidate?: OutreachCandidate
  candidatesTried: number
}

export async function runOutreachLoop(config: OutreachConfig): Promise<OutreachResult> {
  const {
    step,
    locationId,
    shiftId,
    offeredBy,
    extraTokenPayload = {},
    candidates,
    timeoutHours,
    matchKey,
    buildOutreach,
    onAccept,
    outreachAction,
    declinedAction,
  } = config

  let triedCount = 0

  for (const candidate of candidates) {
    triedCount++

    await step.run(`outreach-${candidate.employeeId}`, async () => {
      const acceptPayload = { shiftId, offeredBy, ...extraTokenPayload }
      const declinePayload = { shiftId, ...extraTokenPayload }

      const acceptToken = await generateToken(
        candidate.employeeId,
        "ACCEPT_SWAP",
        acceptPayload,
        timeoutHours + 1
      )
      const declineToken = await generateToken(
        candidate.employeeId,
        "DECLINE_SWAP",
        declinePayload,
        timeoutHours + 1
      )

      const urls: OutreachUrls = {
        acceptUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${acceptToken.id}`,
        declineUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${declineToken.id}`,
      }
      const outreach = await Promise.resolve(buildOutreach(candidate, urls))

      await sendEmail({ to: candidate.email, subject: outreach.subject, react: outreach.react })

      await prisma.auditLog.create({
        data: {
          locationId,
          action: outreachAction,
          aiReasoning: `Priority ${candidate.priority}, fairness score ${candidate.fairnessScore.toFixed(2)}`,
          candidatesConsidered: [{ employeeId: candidate.employeeId, priority: candidate.priority }],
          outcome: "outreach_sent",
        },
      })
    })

    const response = await step.waitForEvent(`wait-${candidate.employeeId}`, {
      event: "swap/response",
      match: matchKey,
      timeout: `${timeoutHours}h`,
    })

    if (response?.data.response === "ACCEPT_SWAP") {
      const result = await onAccept(candidate)
      if (result.outcome === "completed") {
        return { accepted: true, acceptedCandidate: candidate, candidatesTried: triedCount }
      }
      // "continue" — try the next candidate
      continue
    }

    await step.run(`log-skip-${candidate.employeeId}`, () =>
      prisma.auditLog.create({
        data: {
          locationId,
          action: declinedAction,
          aiReasoning: response ? "Candidate declined" : "Candidate did not respond within timeout",
          candidatesConsidered: [{ employeeId: candidate.employeeId, priority: candidate.priority }],
          outcome: response ? "declined" : "timeout",
        },
      })
    )
  }

  return { accepted: false, candidatesTried: triedCount }
}

// ─── Candidate building ──────────────────────────────────────────────────────
// The two workflows previously duplicated this preamble: load location's employees
// with availability, compute their assigned hours for the week, then call
// rankReplacementCandidates. Extracted here so both adapters share it.

interface ShiftForCandidates {
  dayOfWeek: number
  shiftTemplate: { requiredRoles: string[]; startTime: string; endTime: string }
  schedule: {
    weekStart: Date | string
    shifts: Array<{
      employeeId: string | null
      dayOfWeek: number
      status: string
      shiftTemplate: { startTime: string; endTime: string }
    }>
  }
}

export async function buildShiftCandidates(opts: {
  step: StepLike
  locationId: string
  shift: ShiftForCandidates
  // Employee to exclude from candidates (the declined employee or swap requester)
  excludeEmployeeId: string
}): Promise<OutreachCandidate[]> {
  const { step, locationId, shift, excludeEmployeeId } = opts

  // Cast back from `unknown` (StepLike's widened return type) to the actual Prisma type.
  const employees = (await step.run("load-employees", () =>
    prisma.employee.findMany({
      where: { locationId },
      include: { recurringAvailability: true },
    })
  )) as LoadedEmployee[]

  const hoursMap: Record<string, number> = {}
  for (const s of shift.schedule.shifts) {
    if (s.employeeId && s.status !== "DECLINED") {
      const h = shiftDurationHours(s.shiftTemplate.startTime, s.shiftTemplate.endTime)
      hoursMap[s.employeeId] = (hoursMap[s.employeeId] ?? 0) + h
    }
  }

  const ranked = rankReplacementCandidates(
    employees.map((emp) => ({
      id: emp.id,
      name: emp.name,
      roles: emp.roles,
      minHours: emp.minHours,
      maxHours: emp.maxHours,
      assignedHoursThisWeek: hoursMap[emp.id] ?? 0,
      hasVolunteeredForExtra: false,
    })),
    {
      requiredRoles: shift.shiftTemplate.requiredRoles,
      durationHours: shiftDurationHours(shift.shiftTemplate.startTime, shift.shiftTemplate.endTime),
      dayOfWeek: shift.dayOfWeek,
    },
    employees.flatMap((emp) =>
      emp.recurringAvailability.map((a) => ({
        employeeId: emp.id,
        dayOfWeek: a.dayOfWeek,
        available: true,
      }))
    ),
    excludeEmployeeId
  )

  // Hydrate each ranked candidate with the employee's email + name so callers
  // don't need to look them up again. Preserves the priority order.
  const hydrated: OutreachCandidate[] = []
  for (const r of ranked) {
    const emp = employees.find((e) => e.id === r.employeeId)
    if (!emp) continue
    hydrated.push({
      employeeId: r.employeeId,
      email: emp.email,
      name: emp.name,
      priority: r.priority,
      fairnessScore: r.fairnessScore,
    })
  }

  // Legal filter — a candidate whose acceptance would break working-time law
  // (ArbZG, or JArbSchG for minors) is never contacted, and the exclusion is
  // explained in the audit log.
  const rules = (await step.run("load-compliance-rules", () => loadRules(new Date()))) as ComplianceRules
  const weekStart = new Date(shift.schedule.weekStart)
  const candidateSlot: PlannedShift = {
    start: getShiftStart(weekStart, shift.dayOfWeek, shift.shiftTemplate.startTime),
    end: getShiftEnd(weekStart, shift.dayOfWeek, shift.shiftTemplate.endTime),
  }

  const legal: OutreachCandidate[] = []
  const blocked: { candidate: OutreachCandidate; violation: ComplianceViolation }[] = []
  for (const candidate of hydrated) {
    const emp = employees.find((e) => e.id === candidate.employeeId)
    const existing: PlannedShift[] = shift.schedule.shifts
      .filter((s) => s.employeeId === candidate.employeeId && s.status !== "DECLINED")
      .map((s) => ({
        start: getShiftStart(weekStart, s.dayOfWeek, s.shiftTemplate.startTime),
        end: getShiftEnd(weekStart, s.dayOfWeek, s.shiftTemplate.endTime),
      }))
    const violation = checkEmployeeAssignment(
      { birthDate: emp?.birthDate ?? null },
      candidateSlot,
      existing,
      rules
    )
    if (violation) blocked.push({ candidate, violation })
    else legal.push(candidate)
  }

  if (blocked.length > 0) {
    await step.run("log-compliance-blocked", () =>
      prisma.auditLog.create({
        data: {
          locationId,
          action: "COMPLIANCE_BLOCKED",
          aiReasoning: blocked
            .map((b) => `${b.candidate.name}: ${b.violation.rule} — ${b.violation.detail}`)
            .join("; "),
          candidatesConsidered: blocked.map((b) => ({
            employeeId: b.candidate.employeeId,
            rule: b.violation.rule,
          })),
          outcome: `${blocked.length} candidate(s) excluded by working-time law`,
        },
      })
    )
  }

  return legal
}

export function shiftDurationHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  return (eh * 60 + em - (sh * 60 + sm)) / 60
}

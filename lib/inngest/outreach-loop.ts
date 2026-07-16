import { NonRetriableError } from "inngest"
import { prisma } from "@/prisma/client"
import { generateToken } from "@/lib/tokens/generate"
import { sendEmail } from "@/lib/email/send"
import {
  computeShiftCandidates,
  type OutreachCandidate,
  type ShiftForCandidates,
} from "@/lib/scheduling/candidates"
import { pushAgentMessage } from "@/lib/whatsapp-sim/handler"
import * as React from "react"

export { shiftDurationHours, type OutreachCandidate, type ShiftForCandidates } from "@/lib/scheduling/candidates"

// A foreign-key violation (P2003) or missing record (P2025) means the row this
// step depends on was deleted while the run was in flight — re-seeding the demo
// under a live workflow does exactly that. The row will never come back, so
// retrying only burns minutes of backoff before failing anyway.
const PERMANENT_PRISMA_CODES = new Set(["P2003", "P2025"])

function rethrowPermanentAsNonRetriable(err: unknown): never {
  const code = (err as { code?: string } | null)?.code
  if (typeof code === "string" && PERMANENT_PRISMA_CODES.has(code)) {
    throw new NonRetriableError(
      `Referenced row no longer exists (Prisma ${code}) — giving up instead of retrying`,
      { cause: err }
    )
  }
  throw err
}

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

  // Simulator: if set, each contacted candidate also gets this cover request
  // in their WhatsApp thread, with a Yes button that resolves this same loop.
  chatMessage?: string
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
      try {
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

        if (config.chatMessage) {
          // A swap resolves by swapRequestId; a plain replacement by shiftId.
          // The Yes button must carry whichever key this loop waits on.
          const yesCommand =
            matchKey === "data.swapRequestId"
              ? `COVER_SWAP:${extraTokenPayload.swapRequestId}`
              : `COVER:${shiftId}`
          await pushAgentMessage(locationId, candidate.employeeId, config.chatMessage, [
            { label: "🙋 Yes, I can", command: yesCommand },
            { label: "No", command: `NOCOVER:${shiftId}` },
          ])
        }

        await prisma.auditLog.create({
          data: {
            locationId,
            action: outreachAction,
            aiReasoning: `Priority ${candidate.priority}, fairness score ${candidate.fairnessScore.toFixed(2)}`,
            candidatesConsidered: [{ employeeId: candidate.employeeId, priority: candidate.priority }],
            outcome: "outreach_sent",
          },
        })
      } catch (err) {
        rethrowPermanentAsNonRetriable(err)
      }
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
// The real work lives in lib/scheduling/candidates.ts so the WhatsApp handler
// can run it synchronously. Here it stays a SINGLE step.run — it used to be
// six, and every step.run is a full Inngest→server round trip; in production
// those round trips, not the queries inside them, dominated the replacement
// engine's latency. Cheap reads plus one audit write: safe to redo on retry.

export async function buildShiftCandidates(opts: {
  step: StepLike
  locationId: string
  shift: ShiftForCandidates
  // Employee to exclude from candidates (the declined employee or swap requester)
  excludeEmployeeId: string
}): Promise<OutreachCandidate[]> {
  const { step, locationId, shift, excludeEmployeeId } = opts
  return (await step.run("build-candidates", () =>
    computeShiftCandidates({ locationId, shift, excludeEmployeeId })
  )) as OutreachCandidate[]
}

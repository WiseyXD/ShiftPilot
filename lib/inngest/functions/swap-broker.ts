import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { generateManagerToken } from "@/lib/tokens/generate"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import { isInFreezeWindow } from "@/lib/scheduling/freeze"
import {
  getShiftStart,
  getShiftEnd,
  formatShiftDate,
  buildGoogleCalendarUrl,
} from "@/lib/scheduling/shift-date"
import { runOutreachLoop, buildShiftCandidates } from "../outreach-loop"
import { canBackfill } from "@/lib/marketplace/roster"
import { pushAgentMessage } from "@/lib/whatsapp-sim/handler"
import * as React from "react"

export const swapBroker = inngest.createFunction(
  { id: "swap-broker", triggers: [{ event: "swap/requested" }] },
  async ({ event, step }) => {
    const { swapRequestId } = event.data as { swapRequestId: string }

    const swapRequest = await step.run("load-swap-request", () =>
      prisma.swapRequest.findUnique({
        where: { id: swapRequestId },
        include: {
          shift: {
            include: {
              shiftTemplate: true,
              schedule: {
                include: {
                  location: { include: { owner: true } },
                  shifts: { include: { shiftTemplate: true } },
                },
              },
            },
          },
          requester: true,
        },
      })
    )

    if (!swapRequest) return { error: "Swap request not found" }

    // A lent-out shift can't be swapped — the worker is at another venue.
    if (!canBackfill(swapRequest.shift.status)) {
      return { skipped: `shift is ${swapRequest.shift.status} — swap suppressed` }
    }

    const { shift, requester } = swapRequest
    const locationId = shift.schedule.locationId
    const weekStart = new Date(shift.schedule.weekStart)
    const shiftStart = getShiftStart(weekStart, shift.dayOfWeek, shift.shiftTemplate.startTime)
    const shiftEnd = getShiftEnd(weekStart, shift.dayOfWeek, shift.shiftTemplate.endTime)
    const dateLabel = formatShiftDate(shiftStart)

    const candidates = await buildShiftCandidates({
      step,
      locationId,
      shift,
      excludeEmployeeId: requester.id,
    })

    const reassignAndNotifyBoth = async (
      candidateEmail: string,
      candidateName: string,
      candidateEmployeeId: string,
      kind: "auto-approved" | "manager-approved"
    ) => {
      await prisma.shift.update({
        where: { id: shift.id },
        data: { employeeId: candidateEmployeeId, status: "REASSIGNED" },
      })
      await prisma.swapRequest.update({
        where: { id: swapRequestId },
        data: { status: "COMPLETED" },
      })

      const calendarUrl = buildGoogleCalendarUrl({
        title: `${shift.shiftTemplate.name} shift — ${shift.schedule.location.name}`,
        start: shiftStart,
        end: shiftEnd,
        description: `Covering ${requester.name}'s shift at ${shift.schedule.location.name}.`,
        location: shift.schedule.location.name,
      })

      // Notify requester
      await sendEmail({
        to: requester.email,
        subject:
          kind === "auto-approved"
            ? `Swap confirmed for your ${shift.shiftTemplate.name} shift on ${dateLabel}`
            : `Swap approved for your ${shift.shiftTemplate.name} shift on ${dateLabel}`,
        react: React.createElement(NotificationEmail, {
          heading: kind === "auto-approved" ? "Your swap is confirmed" : "Your swap was approved",
          body:
            kind === "auto-approved"
              ? `${candidateName} will cover your ${shift.shiftTemplate.name} shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}). You're all set!`
              : `The manager approved the swap. ${candidateName} will cover your ${shift.shiftTemplate.name} shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}).`,
          ctaLabel: "View schedule",
          ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${locationId}/schedules/${shift.scheduleId}`,
        }),
      })

      // Notify the candidate who agreed
      await sendEmail({
        to: candidateEmail,
        subject: `Confirmed: you're covering ${requester.name}'s ${shift.shiftTemplate.name} shift on ${dateLabel}`,
        react: React.createElement(NotificationEmail, {
          heading: kind === "auto-approved" ? "Thanks for swapping in!" : "Swap approved by manager",
          body:
            kind === "auto-approved"
              ? `You're now scheduled for the ${shift.shiftTemplate.name} shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) at ${shift.schedule.location.name}.`
              : `The manager approved your swap. You're now scheduled for the ${shift.shiftTemplate.name} shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) at ${shift.schedule.location.name}.`,
          ctaLabel: "Add to Google Calendar",
          ctaUrl: calendarUrl,
        }),
      })

      // Simulator: confirm both sides in their WhatsApp threads.
      await pushAgentMessage(
        locationId,
        requester.id,
        `✅ Swap confirmed: *${candidateName}* is covering your *${shift.shiftTemplate.name}* shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}). All set!`
      )
      await pushAgentMessage(
        locationId,
        candidateEmployeeId,
        `🙌 You're covering the *${shift.shiftTemplate.name}* shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) for ${requester.name}. Thanks for stepping in!`
      )

      await prisma.auditLog.create({
        data: {
          locationId,
          action: kind === "auto-approved" ? "SWAP_AUTO_APPROVED" : "SWAP_MANAGER_APPROVED",
          aiReasoning:
            kind === "auto-approved"
              ? "Pre-freeze window; auto-approved on mutual consent"
              : "Manager explicitly approved post-freeze swap",
          candidatesConsidered: [{ employeeId: candidateEmployeeId }],
          outcome: "completed",
        },
      })
    }

    const result = await runOutreachLoop({
      step,
      locationId,
      shiftId: shift.id,
      offeredBy: requester.id,
      matchKey: "data.swapRequestId",
      extraTokenPayload: { swapRequestId },
      candidates,
      timeoutHours: shift.schedule.location.escalationTimeoutHours,
      outreachAction: "SWAP_OUTREACH",
      declinedAction: "SWAP_MANAGER_REJECTED",
      chatMessage: `🔁 *${requester.name}* needs a swap for the *${shift.shiftTemplate.name}* shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}). Can you cover it?`,
      buildOutreach: async (candidate, urls) => {
        // Side effect inside step.run: also update the proposed employee on the
        // swap request so the audit log entries refer to the right candidate.
        await prisma.swapRequest.update({
          where: { id: swapRequestId },
          data: { proposedEmployeeId: candidate.employeeId },
        })
        return {
          subject: `Can you cover ${requester.name}'s shift on ${dateLabel}?`,
          react: React.createElement(NotificationEmail, {
            heading: `Shift swap request — ${dateLabel}`,
            body: `Hi ${candidate.name}, ${requester.name} can't make the ${shift.shiftTemplate.name} shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) at ${shift.schedule.location.name}. Can you swap?`,
            ctaLabel: "Yes, I'll take it",
            ctaUrl: urls.acceptUrl,
            secondaryCtaLabel: "No, I can't",
            secondaryCtaUrl: urls.declineUrl,
          }),
        }
      },
      onAccept: async (candidate) => {
        const frozen = isInFreezeWindow(shiftStart, shift.schedule.location)

        if (!frozen) {
          await step.run(`auto-approve-${candidate.employeeId}`, () =>
            reassignAndNotifyBoth(candidate.email, candidate.name, candidate.employeeId, "auto-approved")
          )
          return { outcome: "completed" }
        }

        // Post-freeze: send manager approval email + wait for decision
        await step.run(`manager-outreach-${candidate.employeeId}`, async () => {
          const approveToken = await generateManagerToken(
            shift.schedule.location.ownerId,
            "APPROVE_SWAP",
            { swapRequestId, shiftId: shift.id, newEmployeeId: candidate.employeeId },
            48
          )
          const rejectToken = await generateManagerToken(
            shift.schedule.location.ownerId,
            "REJECT_SWAP",
            { swapRequestId },
            48
          )

          await sendEmail({
            to: shift.schedule.location.owner.email,
            subject: `Manager approval needed: shift swap on ${dateLabel}`,
            react: React.createElement(NotificationEmail, {
              heading: "Shift swap needs your approval",
              body: `${requester.name} wants to swap their ${shift.shiftTemplate.name} shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) with ${candidate.name}. The shift is within the freeze window and requires your approval.`,
              ctaLabel: "Approve swap",
              ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${approveToken.id}`,
              secondaryCtaLabel: "Reject swap",
              secondaryCtaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${rejectToken.id}`,
            }),
          })

          await prisma.auditLog.create({
            data: {
              locationId,
              action: "SWAP_MANAGER_APPROVAL_REQUESTED",
              aiReasoning: "Post-freeze swap; escalated to manager",
              candidatesConsidered: [{ employeeId: candidate.employeeId }],
              outcome: "awaiting_manager",
            },
          })
        })

        const managerDecision = await step.waitForEvent(`wait-manager-${candidate.employeeId}`, {
          event: "swap/manager-response",
          match: "data.swapRequestId",
          timeout: "48h",
        })

        if (managerDecision?.data.response === "APPROVE_SWAP") {
          await step.run(`manager-approved-${candidate.employeeId}`, () =>
            reassignAndNotifyBoth(candidate.email, candidate.name, candidate.employeeId, "manager-approved")
          )
          return { outcome: "completed" }
        }

        // Manager rejected or timed out — the loop will continue to next candidate,
        // and runOutreachLoop will write the SWAP_MANAGER_REJECTED audit entry.
        return { outcome: "continue" }
      },
    })

    if (!result.accepted) {
      await step.run("notify-requester-failed", async () => {
        await prisma.swapRequest.update({
          where: { id: swapRequestId },
          data: { status: "FAILED" },
        })
        await sendEmail({
          to: requester.email,
          subject: `No swap available for your ${shift.shiftTemplate.name} shift on ${dateLabel}`,
          react: React.createElement(NotificationEmail, {
            heading: "Swap couldn't be arranged",
            body: `We contacted all available employees but none could cover your ${shift.shiftTemplate.name} shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}). Please speak to your manager.`,
            ctaLabel: "View schedule",
            ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${locationId}/schedules/${shift.scheduleId}`,
          }),
        })
        await prisma.auditLog.create({
          data: {
            locationId,
            action: "SWAP_FAILED",
            aiReasoning: `${result.candidatesTried} candidates tried, none available or approved`,
            candidatesConsidered: candidates as unknown as object[],
            outcome: "failed",
          },
        })
      })
    }

    return { swapCompleted: result.accepted, candidatesTried: result.candidatesTried }
  }
)

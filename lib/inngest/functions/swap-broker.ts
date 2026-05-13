import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { rankReplacementCandidates } from "@/lib/scheduling/replacement"
import { generateToken, generateManagerToken } from "@/lib/tokens/generate"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import { isInFreezeWindow } from "@/lib/scheduling/freeze"
import { getShiftStart, getShiftEnd, formatShiftDate, buildGoogleCalendarUrl } from "@/lib/scheduling/shift-date"
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

    const { shift, requester } = swapRequest
    const locationId = shift.schedule.locationId
    const timeoutHours = shift.schedule.location.escalationTimeoutHours

    const employees = await step.run("load-employees", () =>
      prisma.employee.findMany({
        where: { locationId },
        include: { recurringAvailability: true },
      })
    )

    const hoursMap: Record<string, number> = {}
    for (const s of shift.schedule.shifts) {
      if (s.employeeId && s.status !== "DECLINED") {
        const h = shiftHours(s.shiftTemplate.startTime, s.shiftTemplate.endTime)
        hoursMap[s.employeeId] = (hoursMap[s.employeeId] ?? 0) + h
      }
    }

    const shiftDow = shift.dayOfWeek

    const candidates = rankReplacementCandidates(
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
        durationHours: shiftHours(shift.shiftTemplate.startTime, shift.shiftTemplate.endTime),
        dayOfWeek: shiftDow,
      },
      employees.flatMap((emp) =>
        emp.recurringAvailability.map((a) => ({
          employeeId: emp.id,
          dayOfWeek: a.dayOfWeek,
          available: true,
        }))
      ),
      requester.id
    )

    let swapCompleted = false

    for (const candidate of candidates) {
      const emp = employees.find((e) => e.id === candidate.employeeId)!

      await step.run(`outreach-${candidate.employeeId}`, async () => {
        const acceptToken = await generateToken(
          candidate.employeeId,
          "ACCEPT_SWAP",
          { shiftId: shift.id, swapRequestId, offeredBy: requester.id },
          timeoutHours + 1
        )
        const declineToken = await generateToken(
          candidate.employeeId,
          "DECLINE_SWAP",
          { shiftId: shift.id, swapRequestId },
          timeoutHours + 1
        )

        const shiftStart = getShiftStart(new Date(shift.schedule.weekStart), shift.dayOfWeek, shift.shiftTemplate.startTime)
        const dateLabel = formatShiftDate(shiftStart)

        await sendEmail({
          to: emp.email,
          subject: `Can you cover ${requester.name}'s shift on ${dateLabel}?`,
          react: React.createElement(NotificationEmail, {
            heading: `Shift swap request — ${dateLabel}`,
            body: `Hi ${emp.name}, ${requester.name} can't make the ${shift.shiftTemplate.name} shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) at ${shift.schedule.location.name}. Can you swap?`,
            ctaLabel: "Yes, I'll take it",
            ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${acceptToken.id}`,
            secondaryCtaLabel: "No, I can't",
            secondaryCtaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${declineToken.id}`,
          }),
        })

        await prisma.swapRequest.update({
          where: { id: swapRequestId },
          data: { proposedEmployeeId: candidate.employeeId },
        })

        await prisma.auditLog.create({
          data: {
            locationId,
            action: "SWAP_OUTREACH",
            aiReasoning: `Priority ${candidate.priority}, fairness score ${candidate.fairnessScore.toFixed(2)}`,
            candidatesConsidered: [{ employeeId: candidate.employeeId, priority: candidate.priority }],
            outcome: "outreach_sent",
          },
        })
      })

      // Wait for candidate response or timeout
      const response = await step.waitForEvent(`wait-swap-${candidate.employeeId}`, {
        event: "swap/response",
        match: "data.swapRequestId",
        timeout: `${timeoutHours}h`,
      })

      if (response?.data.response !== "ACCEPT_SWAP") continue

      // Candidate accepted — check freeze window
      const shiftDate = new Date(shift.schedule.weekStart)
      const [h, m] = shift.shiftTemplate.startTime.split(":").map(Number)
      shiftDate.setHours(h, m, 0, 0)

      const frozen = isInFreezeWindow(shiftDate, shift.schedule.location)

      if (!frozen) {
        // Pre-freeze: auto-approve
        await step.run(`auto-approve-${candidate.employeeId}`, async () => {
          await prisma.shift.update({
            where: { id: shift.id },
            data: { employeeId: candidate.employeeId, status: "REASSIGNED" },
          })
          await prisma.swapRequest.update({
            where: { id: swapRequestId },
            data: { status: "COMPLETED" },
          })

          const preStart = getShiftStart(new Date(shift.schedule.weekStart), shift.dayOfWeek, shift.shiftTemplate.startTime)
          const preEnd = getShiftEnd(new Date(shift.schedule.weekStart), shift.dayOfWeek, shift.shiftTemplate.endTime)
          const preDateLabel = formatShiftDate(preStart)
          const calendarUrl = buildGoogleCalendarUrl({
            title: `${shift.shiftTemplate.name} shift — ${shift.schedule.location.name}`,
            start: preStart,
            end: preEnd,
            description: `Covering ${requester.name}'s shift at ${shift.schedule.location.name}.`,
            location: shift.schedule.location.name,
          })

          // Notify requester: someone took it
          await sendEmail({
            to: requester.email,
            subject: `Swap confirmed for your ${shift.shiftTemplate.name} shift on ${preDateLabel}`,
            react: React.createElement(NotificationEmail, {
              heading: "Your swap is confirmed",
              body: `${emp.name} will cover your ${shift.shiftTemplate.name} shift on ${preDateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}). You're all set!`,
              ctaLabel: "View schedule",
              ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${locationId}/schedules/${shift.scheduleId}`,
            }),
          })

          // Notify the candidate who agreed: their new shift confirmation + calendar link
          await sendEmail({
            to: emp.email,
            subject: `Confirmed: you're covering ${requester.name}'s ${shift.shiftTemplate.name} shift on ${preDateLabel}`,
            react: React.createElement(NotificationEmail, {
              heading: "Thanks for swapping in!",
              body: `You're now scheduled for the ${shift.shiftTemplate.name} shift on ${preDateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) at ${shift.schedule.location.name}.`,
              ctaLabel: "Add to Google Calendar",
              ctaUrl: calendarUrl,
            }),
          })

          await prisma.auditLog.create({
            data: {
              locationId,
              action: "SWAP_AUTO_APPROVED",
              aiReasoning: "Pre-freeze window; auto-approved on mutual consent",
              candidatesConsidered: [{ employeeId: candidate.employeeId }],
              outcome: "completed",
            },
          })
        })
        swapCompleted = true
        break
      }

      // Post-freeze: need manager approval
      const approved = await step.run(`manager-outreach-${candidate.employeeId}`, async () => {
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

        const mgrShiftStart = getShiftStart(new Date(shift.schedule.weekStart), shift.dayOfWeek, shift.shiftTemplate.startTime)
        const mgrDateLabel = formatShiftDate(mgrShiftStart)

        await sendEmail({
          to: shift.schedule.location.owner.email,
          subject: `Manager approval needed: shift swap on ${mgrDateLabel}`,
          react: React.createElement(NotificationEmail, {
            heading: "Shift swap needs your approval",
            body: `${requester.name} wants to swap their ${shift.shiftTemplate.name} shift on ${mgrDateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) with ${emp.name}. The shift is within the freeze window and requires your approval.`,
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

        return null // will be determined by manager token
      })

      void approved

      const managerDecision = await step.waitForEvent(`wait-manager-${candidate.employeeId}`, {
        event: "swap/manager-response",
        match: "data.swapRequestId",
        timeout: "48h",
      })

      if (managerDecision?.data.response === "APPROVE_SWAP") {
        await step.run(`manager-approved-${candidate.employeeId}`, async () => {
          await prisma.shift.update({
            where: { id: shift.id },
            data: { employeeId: candidate.employeeId, status: "REASSIGNED" },
          })
          await prisma.swapRequest.update({
            where: { id: swapRequestId },
            data: { status: "COMPLETED" },
          })

          const postStart = getShiftStart(new Date(shift.schedule.weekStart), shift.dayOfWeek, shift.shiftTemplate.startTime)
          const postEnd = getShiftEnd(new Date(shift.schedule.weekStart), shift.dayOfWeek, shift.shiftTemplate.endTime)
          const postDateLabel = formatShiftDate(postStart)
          const calendarUrl = buildGoogleCalendarUrl({
            title: `${shift.shiftTemplate.name} shift — ${shift.schedule.location.name}`,
            start: postStart,
            end: postEnd,
            description: `Covering ${requester.name}'s shift at ${shift.schedule.location.name}.`,
            location: shift.schedule.location.name,
          })

          // Notify requester
          await sendEmail({
            to: requester.email,
            subject: `Swap approved for your ${shift.shiftTemplate.name} shift on ${postDateLabel}`,
            react: React.createElement(NotificationEmail, {
              heading: "Your swap was approved",
              body: `The manager approved the swap. ${emp.name} will cover your ${shift.shiftTemplate.name} shift on ${postDateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}).`,
              ctaLabel: "View schedule",
              ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${locationId}/schedules/${shift.scheduleId}`,
            }),
          })

          // Notify the candidate (the one who agreed to swap in)
          await sendEmail({
            to: emp.email,
            subject: `Confirmed: you're covering ${requester.name}'s shift on ${postDateLabel}`,
            react: React.createElement(NotificationEmail, {
              heading: "Swap approved by manager",
              body: `The manager approved your swap. You're now scheduled for the ${shift.shiftTemplate.name} shift on ${postDateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) at ${shift.schedule.location.name}.`,
              ctaLabel: "Add to Google Calendar",
              ctaUrl: calendarUrl,
            }),
          })

          await prisma.auditLog.create({
            data: {
              locationId,
              action: "SWAP_MANAGER_APPROVED",
              aiReasoning: "Manager explicitly approved post-freeze swap",
              candidatesConsidered: [{ employeeId: candidate.employeeId }],
              outcome: "completed",
            },
          })
        })
        swapCompleted = true
        break
      } else {
        // Manager rejected or timed out — try next candidate
        await step.run(`manager-rejected-${candidate.employeeId}`, () =>
          prisma.auditLog.create({
            data: {
              locationId,
              action: "SWAP_MANAGER_REJECTED",
              aiReasoning: "Manager rejected or did not respond within 48h",
              candidatesConsidered: [{ employeeId: candidate.employeeId }],
              outcome: "rejected",
            },
          })
        )
      }
    }

    if (!swapCompleted) {
      await step.run("notify-requester-failed", async () => {
        await prisma.swapRequest.update({
          where: { id: swapRequestId },
          data: { status: "FAILED" },
        })
        await sendEmail({
          to: requester.email,
          subject: `No swap available for your ${shift.shiftTemplate.name} shift`,
          react: React.createElement(NotificationEmail, {
            heading: "Swap couldn't be arranged",
            body: `We contacted all available employees but none could cover your ${shift.shiftTemplate.name} shift (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}). Please speak to your manager.`,
            ctaLabel: "View schedule",
            ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${locationId}/schedules/${shift.scheduleId}`,
          }),
        })
        await prisma.auditLog.create({
          data: {
            locationId,
            action: "SWAP_FAILED",
            aiReasoning: `${candidates.length} candidates tried, none available or approved`,
            candidatesConsidered: candidates as object[],
            outcome: "failed",
          },
        })
      })
    }

    return { swapCompleted, candidatesTried: candidates.length }
  }
)

function shiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  return (eh * 60 + em - (sh * 60 + sm)) / 60
}

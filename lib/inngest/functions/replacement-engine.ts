import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import {
  getShiftStart,
  getShiftEnd,
  formatShiftDate,
  buildGoogleCalendarUrl,
} from "@/lib/scheduling/shift-date"
import { runOutreachLoop, buildShiftCandidates } from "../outreach-loop"
import { canBackfill } from "@/lib/marketplace/roster"
import { pushAgentMessage } from "@/lib/whatsapp-sim/handler"
import { pushOwnerMessage, ownerThreadLanguage } from "@/lib/agent/owner-thread"
import { t, fmtDay } from "@/lib/agent/i18n"
import * as React from "react"

export const replacementEngine = inngest.createFunction(
  {
    id: "replacement-engine",
    triggers: [{ event: "shift/declined" }, { event: "shift/sick-call" }],
  },
  async ({ event, step }) => {
    const { shiftId } = event.data as { shiftId: string }

    const shift = await step.run("load-shift", () =>
      prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          shiftTemplate: true,
          employee: true,
          schedule: {
            include: {
              location: { include: { owner: true } },
              shifts: { include: { shiftTemplate: true } },
            },
          },
        },
      })
    )

    if (!shift) return { error: "Shift not found" }

    // A lent-out shift is deliberately uncovered — the freeze window doesn't
    // gate this engine, so this check is the ONLY thing stopping a backfill
    // cascade on a lent shift.
    if (!canBackfill(shift.status)) {
      return { skipped: `shift is ${shift.status} — backfill suppressed` }
    }

    const locationId = shift.schedule.locationId
    const declinedById = shift.employeeId ?? "none"
    const weekStart = new Date(shift.schedule.weekStart)
    const shiftStart = getShiftStart(weekStart, shift.dayOfWeek, shift.shiftTemplate.startTime)
    const shiftEnd = getShiftEnd(weekStart, shift.dayOfWeek, shift.shiftTemplate.endTime)
    const dateLabel = formatShiftDate(shiftStart)

    const candidates = await buildShiftCandidates({
      step,
      locationId,
      shift,
      excludeEmployeeId: declinedById,
    })

    const result = await runOutreachLoop({
      step,
      locationId,
      shiftId,
      offeredBy: declinedById,
      matchKey: "data.shiftId",
      candidates,
      timeoutHours: shift.schedule.location.escalationTimeoutHours,
      outreachAction: "REPLACEMENT_OUTREACH",
      declinedAction: "REPLACEMENT_DECLINED",
      chatMessage: `🔔 Can anyone cover? The *${shift.shiftTemplate.name}* shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) just opened up.`,
      buildOutreach: (candidate, urls) => ({
        subject: `Can you cover a shift at ${shift.schedule.location.name} on ${dateLabel}?`,
        react: React.createElement(NotificationEmail, {
          heading: `Can you cover this ${shift.shiftTemplate.name} shift?`,
          body: `Hi ${candidate.name}, we need someone to cover the ${shift.shiftTemplate.name} shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) at ${shift.schedule.location.name}. Can you help?`,
          ctaLabel: "Yes, I'll take it",
          ctaUrl: urls.acceptUrl,
          secondaryCtaLabel: "No, I can't",
          secondaryCtaUrl: urls.declineUrl,
        }),
      }),
      onAccept: async (candidate) => {
        await step.run(`reassign-${candidate.employeeId}`, async () => {
          await prisma.shift.update({
            where: { id: shiftId },
            data: { employeeId: candidate.employeeId, status: "REASSIGNED" },
          })

          const calendarUrl = buildGoogleCalendarUrl({
            title: `${shift.shiftTemplate.name} shift — ${shift.schedule.location.name}`,
            start: shiftStart,
            end: shiftEnd,
            description: `Covering shift at ${shift.schedule.location.name}.`,
            location: shift.schedule.location.name,
          })

          await sendEmail({
            to: candidate.email,
            subject: `Confirmed: you're covering the ${shift.shiftTemplate.name} shift on ${dateLabel}`,
            react: React.createElement(NotificationEmail, {
              heading: "Thanks for stepping in!",
              body: `You're now scheduled for the ${shift.shiftTemplate.name} shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) at ${shift.schedule.location.name}.`,
              ctaLabel: "Add to Google Calendar",
              ctaUrl: calendarUrl,
            }),
          })

          // Simulator: confirm the cover in the candidate's WhatsApp thread.
          await pushAgentMessage(
            locationId,
            candidate.employeeId,
            `✅ You're covering the *${shift.shiftTemplate.name}* shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}). Thanks for stepping in! ☕`
          )

          await prisma.auditLog.create({
            data: {
              locationId,
              action: "REPLACEMENT_FOUND",
              aiReasoning: `Reassigned to ${candidate.name} (priority ${candidate.priority})`,
              candidatesConsidered: [{ employeeId: candidate.employeeId, priority: candidate.priority }],
              outcome: "reassigned",
            },
          })

          // The owner hears the outcome proactively in their copilot thread.
          const lang = await ownerThreadLanguage(locationId)
          await pushOwnerMessage(
            locationId,
            t(lang).replacementFound(
              candidate.name,
              shift.shiftTemplate.name,
              fmtDay(lang, shiftStart),
              `${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}`,
              shift.employee?.name ?? null
            )
          )
        })
        return { outcome: "completed" }
      },
    })

    if (!result.accepted) {
      await step.run("escalate", async () => {
        const timeToShift = Math.max(
          0,
          Math.round((shiftStart.getTime() - Date.now()) / (1000 * 60 * 60))
        )

        await sendEmail({
          to: shift.schedule.location.owner.email,
          subject: `⚠️ No replacement found for ${shift.shiftTemplate.name} at ${shift.schedule.location.name}`,
          react: React.createElement(NotificationEmail, {
            heading: "Manual action needed",
            body: `All ${result.candidatesTried} available employees were contacted but none could cover the ${shift.shiftTemplate.name} shift on ${dateLabel}. The shift starts in approximately ${timeToShift} hours. Please assign a replacement manually.`,
            ctaLabel: "View schedule",
            ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${locationId}/schedules/${shift.scheduleId}`,
          }),
        })

        await prisma.auditLog.create({
          data: {
            locationId,
            action: "ESCALATED_TO_MANAGER",
            aiReasoning: `${result.candidatesTried} candidates tried, none available`,
            candidatesConsidered: candidates as unknown as object[],
            outcome: "escalated",
          },
        })

        const lang = await ownerThreadLanguage(locationId)
        await pushOwnerMessage(
          locationId,
          t(lang).replacementFailed(
            shift.shiftTemplate.name,
            fmtDay(lang, shiftStart),
            result.candidatesTried
          )
        )
      })
    }

    return { replacementFound: result.accepted, candidatesTried: result.candidatesTried }
  }
)

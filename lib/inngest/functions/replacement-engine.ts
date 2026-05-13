import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { rankReplacementCandidates } from "@/lib/scheduling/replacement"
import { generateToken } from "@/lib/tokens/generate"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import { getShiftStart, getShiftEnd, formatShiftDate, buildGoogleCalendarUrl } from "@/lib/scheduling/shift-date"
import * as React from "react"

export const replacementEngine = inngest.createFunction(
  {
    id: "replacement-engine",
    triggers: [
      { event: "shift/declined" },
      { event: "shift/sick-call" },
    ],
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

    const locationId = shift.schedule.locationId
    const declinedById = shift.employeeId ?? "none"

    // Build candidate data
    const employees = await step.run("load-employees", () =>
      prisma.employee.findMany({
        where: { locationId },
        include: { recurringAvailability: true },
      })
    )

    // Calculate assigned hours this week per employee
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
      declinedById
    )

    const timeoutHours = shift.schedule.location.escalationTimeoutHours
    let replacementFound = false

    for (const candidate of candidates) {
      const emp = employees.find((e) => e.id === candidate.employeeId)!

      await step.run(`outreach-${candidate.employeeId}`, async () => {
        const acceptToken = await generateToken(
          candidate.employeeId,
          "ACCEPT_SWAP",
          { shiftId, offeredBy: declinedById },
          timeoutHours + 1
        )
        const declineToken = await generateToken(
          candidate.employeeId,
          "DECLINE_SWAP",
          { shiftId },
          timeoutHours + 1
        )

        const shiftStart = getShiftStart(new Date(shift.schedule.weekStart), shift.dayOfWeek, shift.shiftTemplate.startTime)
        const dateLabel = formatShiftDate(shiftStart)

        await sendEmail({
          to: emp.email,
          subject: `Can you cover a shift at ${shift.schedule.location.name} on ${dateLabel}?`,
          react: React.createElement(NotificationEmail, {
            heading: `Can you cover this ${shift.shiftTemplate.name} shift?`,
            body: `Hi ${emp.name}, we need someone to cover the ${shift.shiftTemplate.name} shift on ${dateLabel} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) at ${shift.schedule.location.name}. Can you help?`,
            ctaLabel: "Yes, I'll take it",
            ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${acceptToken.id}`,
            secondaryCtaLabel: "No, I can't",
            secondaryCtaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${declineToken.id}`,
          }),
        })

        await prisma.auditLog.create({
          data: {
            locationId,
            action: "REPLACEMENT_OUTREACH",
            aiReasoning: `Priority ${candidate.priority}, fairness score ${candidate.fairnessScore.toFixed(2)}`,
            candidatesConsidered: [{ employeeId: candidate.employeeId, priority: candidate.priority }],
            outcome: "outreach_sent",
          },
        })
      })

      // Wait for the candidate to click Accept or Decline (or timeout)
      const response = await step.waitForEvent(`wait-${candidate.employeeId}`, {
        event: "swap/response",
        match: "data.shiftId",
        timeout: `${timeoutHours}h`,
      })

      if (response?.data.response === "ACCEPT_SWAP") {
        // Candidate accepted — reassign the shift and notify everyone
        await step.run(`reassign-${candidate.employeeId}`, async () => {
          await prisma.shift.update({
            where: { id: shiftId },
            data: { employeeId: candidate.employeeId, status: "REASSIGNED" },
          })

          const start = getShiftStart(new Date(shift.schedule.weekStart), shift.dayOfWeek, shift.shiftTemplate.startTime)
          const end = getShiftEnd(new Date(shift.schedule.weekStart), shift.dayOfWeek, shift.shiftTemplate.endTime)
          const calendarUrl = buildGoogleCalendarUrl({
            title: `${shift.shiftTemplate.name} shift — ${shift.schedule.location.name}`,
            start,
            end,
            description: `Covering shift at ${shift.schedule.location.name}.`,
            location: shift.schedule.location.name,
          })

          await sendEmail({
            to: emp.email,
            subject: `Confirmed: you're covering the ${shift.shiftTemplate.name} shift on ${formatShiftDate(start)}`,
            react: React.createElement(NotificationEmail, {
              heading: "Thanks for stepping in!",
              body: `You're now scheduled for the ${shift.shiftTemplate.name} shift on ${formatShiftDate(start)} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) at ${shift.schedule.location.name}.`,
              ctaLabel: "Add to Google Calendar",
              ctaUrl: calendarUrl,
            }),
          })

          await prisma.auditLog.create({
            data: {
              locationId,
              action: "REPLACEMENT_FOUND",
              aiReasoning: `Reassigned to ${emp.name} (priority ${candidate.priority})`,
              candidatesConsidered: [{ employeeId: candidate.employeeId, priority: candidate.priority }],
              outcome: "reassigned",
            },
          })
        })
        replacementFound = true
        break
      }

      // Declined or timed out — log and try the next candidate
      await step.run(`log-skip-${candidate.employeeId}`, () =>
        prisma.auditLog.create({
          data: {
            locationId,
            action: "REPLACEMENT_DECLINED",
            aiReasoning: response ? "Candidate declined" : "Candidate did not respond within timeout",
            candidatesConsidered: [{ employeeId: candidate.employeeId, priority: candidate.priority }],
            outcome: response ? "declined" : "timeout",
          },
        })
      )
    }

    if (!replacementFound) {
      // Escalate to manager
      await step.run("escalate", async () => {
        const shiftDate = new Date(shift.schedule.weekStart)
        const timeToShift = Math.max(
          0,
          Math.round((shiftDate.getTime() - Date.now()) / (1000 * 60 * 60))
        )

        await sendEmail({
          to: shift.schedule.location.owner.email,
          subject: `⚠️ No replacement found for ${shift.shiftTemplate.name} at ${shift.schedule.location.name}`,
          react: React.createElement(NotificationEmail, {
            heading: "Manual action needed",
            body: `All ${candidates.length} available employees were contacted but none could cover the ${shift.shiftTemplate.name} shift. The shift starts in approximately ${timeToShift} hours. Please assign a replacement manually.`,
            ctaLabel: "View schedule",
            ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${locationId}/schedules/${shift.scheduleId}`,
          }),
        })

        await prisma.auditLog.create({
          data: {
            locationId,
            action: "ESCALATED_TO_MANAGER",
            aiReasoning: `${candidates.length} candidates tried, none available`,
            candidatesConsidered: candidates as object[],
            outcome: "escalated",
          },
        })
      })
    }

    return { replacementFound, candidatesTried: candidates.length }
  }
)

function shiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  return (eh * 60 + em - (sh * 60 + sm)) / 60
}

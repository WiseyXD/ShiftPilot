import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { generateManagerToken } from "@/lib/tokens/generate"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import { getShiftStart, formatShiftDate } from "@/lib/scheduling/shift-date"
import { pushOwnerMessage } from "@/lib/agent/owner-thread"
import * as React from "react"

// Reminder cadence: escalating but finite — the red dashboard banner persists
// beyond the last email either way.
const REMINDER_DELAYS = ["30m", "2h", "4h", "8h", "12h"] as const

// Nags the manager until they confirm a sick call. The confirmation itself is
// written by the token handler (or the dashboard button) — this loop only
// sends reminders and stops the moment sick/confirmed arrives.
export const sickConfirmationNag = inngest.createFunction(
  { id: "sick-confirmation-nag", triggers: [{ event: "sick/reported" }] },
  async ({ event, step }) => {
    const { sickCallId } = event.data as { sickCallId: string }

    const sickCall = await step.run("load-sick-call", () =>
      prisma.sickCall.findUnique({ where: { id: sickCallId } })
    )
    if (!sickCall || sickCall.confirmedAt) return { skipped: true }

    const context = await step.run("load-context", async () => {
      const [location, shift, employee] = await Promise.all([
        prisma.location.findUnique({
          where: { id: sickCall.locationId },
          include: { owner: { select: { id: true, email: true } } },
        }),
        prisma.shift.findUnique({
          where: { id: sickCall.shiftId },
          include: { shiftTemplate: true, schedule: { select: { weekStart: true } } },
        }),
        prisma.employee.findUnique({ where: { id: sickCall.employeeId } }),
      ])
      return { location, shift, employee }
    })
    if (!context.location || !context.shift || !context.employee) return { error: "context gone" }

    const start = getShiftStart(
      new Date(context.shift.schedule.weekStart),
      context.shift.dayOfWeek,
      context.shift.shiftTemplate.startTime
    )
    const summary = `${context.employee.name} — ${context.shift.shiftTemplate.name} on ${formatShiftDate(start)}`

    // Copilot thread first: the owner usually sees chat before email.
    await step.run("notify-copilot", () =>
      pushOwnerMessage(
        sickCall.locationId,
        `🤒 *${context.employee!.name}* hat sich krankgemeldet (${context.shift!.shiftTemplate.name} am ${formatShiftDate(start)}). Ich suche bereits Ersatz — bitte bestätige die Krankmeldung im Dashboard oder per E-Mail.`
      )
    )

    for (let attempt = 0; attempt <= REMINDER_DELAYS.length; attempt++) {
      await step.run(`notify-${attempt}`, async () => {
        const token = await generateManagerToken(
          context.location!.owner.id,
          "CONFIRM_SICK",
          { sickCallId },
          48
        )
        await sendEmail({
          to: context.location!.owner.email,
          subject:
            attempt === 0
              ? `🤒 Sick call: ${summary}`
              : `⚠️ Reminder ${attempt}: unconfirmed sick call — ${summary}`,
          react: React.createElement(NotificationEmail, {
            heading: attempt === 0 ? "An employee called in sick" : "Still unconfirmed: sick call",
            body: `${summary} reported sick. Replacement search is already running — but please confirm you've seen this. Reminders continue until you do.`,
            ctaLabel: "I've seen it — confirm",
            ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${token.id}`,
            secondaryCtaLabel: "Open dashboard",
            secondaryCtaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${sickCall.locationId}`,
          }),
        })
      })

      if (attempt === REMINDER_DELAYS.length) break // banner carries on alone

      const confirmed = await step.waitForEvent(`wait-confirm-${attempt}`, {
        event: "sick/confirmed",
        match: "data.sickCallId",
        timeout: REMINDER_DELAYS[attempt],
      })
      if (confirmed) return { outcome: "confirmed", reminders: attempt }
    }

    return { outcome: "reminders_exhausted", reminders: REMINDER_DELAYS.length }
  }
)

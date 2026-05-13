import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { generateToken } from "@/lib/tokens/generate"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import * as React from "react"

// Runs daily. For each location whose generationDayOfWeek is 4 days away, send override reminders.
export const weeklyAvailabilityReminder = inngest.createFunction(
  {
    id: "weekly-availability-reminder",
    triggers: [{ cron: "0 8 * * *" }],
  },
  async ({ step }) => {
    const today = new Date()
    const targetDayOfWeek = (today.getDay() + 4) % 7 // 4 days from now

    const locations = await step.run("find-locations", () =>
      prisma.location.findMany({
        where: { generationDayOfWeek: targetDayOfWeek },
        include: { employees: true },
      })
    )

    let totalSent = 0

    for (const location of locations) {
      await step.run(`remind-${location.id}`, async () => {
        // Compute the weekStart this reminder covers (next occurrence of generationDayOfWeek + 1 week ahead)
        const weekStart = nextWeekStart(today)

        for (const employee of location.employees) {
          const token = await generateToken(
            employee.id,
            "SUBMIT_AVAILABILITY",
            { locationId: location.id, weekStart: weekStart.toISOString(), isOverride: true },
            96 // 4 days TTL — expires when the schedule generates
          )

          const url = `${process.env.NEXT_PUBLIC_APP_URL}/availability-override/${token.id}`

          await sendEmail({
            to: employee.email,
            subject: `Any changes to your availability next week? — ${location.name}`,
            react: React.createElement(NotificationEmail, {
              heading: "Any changes next week?",
              body: `Hi ${employee.name}, the schedule for ${location.name} will be generated soon. If your availability differs from your usual pattern next week, let us know. Otherwise, no action needed.`,
              ctaLabel: "Update availability",
              ctaUrl: url,
            }),
          })
          totalSent++
        }
      })
    }

    return { sent: totalSent }
  }
)

function nextWeekStart(from: Date): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + 7)
  d.setHours(0, 0, 0, 0)
  return d
}

import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { generateToken } from "@/lib/tokens/generate"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import { needsAvailability } from "@/lib/scheduling/categories"
import * as React from "react"

// Escalating waves before the generation deadline (concept doc §6.1):
// 4 days out — everyone gets the ask; 2 days and 1 day out — only still-
// unconfirmed category-A employees, with the consequence spelled out.
const WAVES = [
  { daysBefore: 4, finalWarning: false },
  { daysBefore: 2, finalWarning: false },
  { daysBefore: 1, finalWarning: true },
] as const

export const weeklyAvailabilityReminder = inngest.createFunction(
  {
    id: "weekly-availability-reminder",
    triggers: [{ cron: "0 8 * * *" }],
  },
  async ({ step }) => {
    const today = new Date()
    let totalSent = 0

    for (const wave of WAVES) {
      const targetDayOfWeek = (today.getDay() + wave.daysBefore) % 7

      const locations = await step.run(`find-locations-${wave.daysBefore}d`, () =>
        prisma.location.findMany({
          where: { generationDayOfWeek: targetDayOfWeek },
          include: { employees: true },
        })
      )

      for (const location of locations) {
        await step.run(`remind-${wave.daysBefore}d-${location.id}`, async () => {
          const weekStart = nextWeekStart(today)

          // Later waves only chase unconfirmed category-A employees.
          let targets = location.employees
          if (wave.daysBefore < 4) {
            const confirmed = await prisma.availabilityConfirmation.findMany({
              where: { weekStart, employeeId: { in: location.employees.map((e) => e.id) } },
              select: { employeeId: true },
            })
            const overrides = await prisma.availabilityOverride.findMany({
              where: {
                employeeId: { in: location.employees.map((e) => e.id) },
                date: { gte: weekStart, lt: new Date(weekStart.getTime() + 7 * 86400000) },
              },
              select: { employeeId: true },
            })
            const confirmedIds = new Set([
              ...confirmed.map((c) => c.employeeId),
              ...overrides.map((o) => o.employeeId),
            ])
            targets = location.employees.filter(
              (e) => needsAvailability(e.category) && !confirmedIds.has(e.id)
            )
          }

          for (const employee of targets) {
            const overrideToken = await generateToken(
              employee.id,
              "SUBMIT_AVAILABILITY",
              { locationId: location.id, weekStart: weekStart.toISOString(), isOverride: true },
              96
            )
            const confirmToken = await generateToken(
              employee.id,
              "CONFIRM_AVAILABILITY",
              { employeeId: employee.id, weekStart: weekStart.toISOString() },
              96
            )

            const consequence = needsAvailability(employee.category)
              ? " Without a response by the deadline you won't be scheduled next week."
              : ""

            await sendEmail({
              to: employee.email,
              subject: wave.finalWarning
                ? `⏰ Last call: confirm your availability — ${location.name}`
                : `Any changes to your availability next week? — ${location.name}`,
              react: React.createElement(NotificationEmail, {
                heading: wave.finalWarning
                  ? "Last call — the schedule generates tomorrow"
                  : "Any changes next week?",
                body: `Hi ${employee.name}, the schedule for ${location.name} generates soon. Tap "Nothing changed" to carry over your usual availability, or update it if next week differs.${consequence}`,
                ctaLabel: "Nothing changed — confirm",
                ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${confirmToken.id}`,
                secondaryCtaLabel: "Update availability",
                secondaryCtaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/availability-override/${overrideToken.id}`,
              }),
            })
            totalSent++
          }
        })
      }
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

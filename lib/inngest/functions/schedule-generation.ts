import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { getEffectiveAvailability } from "@/lib/scheduling/availability"
import { generateSchedule } from "@/lib/scheduling/generate"
import { generateToken } from "@/lib/tokens/generate"
import { sendEmail } from "@/lib/email/send"
import { ScheduleDraftEmail } from "@/lib/email/templates/schedule-draft"
import * as React from "react"

export const weeklyScheduleGeneration = inngest.createFunction(
  {
    id: "weekly-schedule-generation",
    triggers: [{ cron: "0 7 * * *" }],
  },
  async ({ step }) => {
    const today = new Date()
    const todayDow = today.getDay()

    const locations = await step.run("find-locations", () =>
      prisma.location.findMany({
        where: { generationDayOfWeek: todayDow },
        include: {
          employees: true,
          shiftTemplates: true,
          owner: true,
        },
      })
    )

    let generated = 0

    for (const location of locations) {
      await step.run(`generate-${location.id}`, async () => {
        const weekStart = nextMonday(today)

        const availability = await getEffectiveAvailability(location.id, weekStart)
        const { assignments, reasoning } = await generateSchedule(
          location.shiftTemplates,
          location.employees,
          availability
        )

        // Persist schedule + shifts
        const schedule = await prisma.schedule.create({
          data: {
            locationId: location.id,
            weekStart,
            status: "DRAFT",
            shifts: {
              create: assignments.map((a) => ({
                shiftTemplateId: a.shiftTemplateId,
                employeeId: a.employeeId,
                status: a.filled ? "PENDING" : "UNASSIGNED",
              })),
            },
          },
        })

        // Write audit log
        await prisma.auditLog.create({
          data: {
            locationId: location.id,
            action: "SCHEDULE_GENERATED",
            aiReasoning: reasoning,
            candidatesConsidered: assignments as object[],
            outcome: `${assignments.filter((a) => a.filled).length}/${assignments.length} shifts filled`,
          },
        })

        // Generate approve token for manager
        const approveToken = await generateToken(
          // Use a placeholder — manager uses session auth to approve
          // Store locationId + scheduleId in payload
          location.employees[0]?.id ?? "system",
          "APPROVE_SCHEDULE",
          { scheduleId: schedule.id, locationId: location.id },
          72
        )

        const unfilled = assignments.filter((a) => !a.filled)
        const approveUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${location.id}/schedules/${schedule.id}/approve?token=${approveToken.id}`

        await sendEmail({
          to: location.owner.email,
          subject: `Schedule draft ready for ${location.name}`,
          react: React.createElement(ScheduleDraftEmail, {
            locationName: location.name,
            weekStart: weekStart.toISOString(),
            filledCount: assignments.filter((a) => a.filled).length,
            totalCount: assignments.length,
            unfilledCount: unfilled.length,
            approveUrl,
            reviewUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${location.id}/schedules/${schedule.id}`,
          }),
        })

        generated++
      })
    }

    return { generated }
  }
)

function nextMonday(from: Date): Date {
  const d = new Date(from)
  const day = d.getDay()
  const diff = day === 1 ? 7 : (8 - day) % 7
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

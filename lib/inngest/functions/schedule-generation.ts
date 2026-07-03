import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { getEffectiveAvailability } from "@/lib/scheduling/availability"
import { generateSchedule } from "@/lib/scheduling/generate"
import { loadRules } from "@/lib/compliance/load"
import { loadMonthNetHoursBeforeWeek } from "@/lib/compliance/hours"
import { minijobCapWarning } from "@/lib/compliance/caps"
import { netWorkHours } from "@/lib/compliance/arbzg"
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
        const rules = await loadRules(weekStart)
        const monthHours = await loadMonthNetHoursBeforeWeek(
          location.employees.map((e) => e.id),
          weekStart,
          rules.arbzg
        )
        const { assignments, reasoning } = await generateSchedule(
          location.shiftTemplates,
          location.employees,
          availability,
          rules,
          monthHours
        )

        // Early warning: minijobbers approaching the earnings cap after this
        // week's assignments — the manager hears about it before blocks start.
        const tmplTimes = new Map(location.shiftTemplates.map((t) => [t.id, t]))
        for (const emp of location.employees) {
          if (emp.category !== "MINIJOB_ZEITARBEIT" || !emp.hourlyWageCents) continue
          const weekNet = assignments
            .filter((a) => a.employeeId === emp.id)
            .reduce((sum, a) => {
              const t = tmplTimes.get(a.shiftTemplateId)
              if (!t) return sum
              const day = new Date(2001, 0, 1)
              const [sh, sm] = t.startTime.split(":").map(Number)
              const [eh, em] = t.endTime.split(":").map(Number)
              const start = new Date(day)
              start.setHours(sh, sm, 0, 0)
              const end = new Date(day)
              end.setHours(eh, em, 0, 0)
              return sum + netWorkHours({ start, end }, rules.arbzg)
            }, 0)
          const monthNet = (monthHours[emp.id] ?? 0) + weekNet
          if (minijobCapWarning(emp.hourlyWageCents, monthNet, rules.minijob)) {
            await prisma.auditLog.create({
              data: {
                locationId: location.id,
                action: "MINIJOB_CAP_WARNING",
                aiReasoning: `${emp.name}: ~${((emp.hourlyWageCents * monthNet) / 100).toFixed(2)} € scheduled this month — approaching the ${(rules.minijob.monthlyEarningsCapCents / 100).toFixed(0)} € cap`,
                candidatesConsidered: [{ employeeId: emp.id }],
                outcome: "warning",
              },
            })
          }
        }

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
                dayOfWeek: a.dayOfWeek,
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

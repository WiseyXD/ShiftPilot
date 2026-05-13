import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { generateToken } from "@/lib/tokens/generate"
import { sendEmail } from "@/lib/email/send"
import { ShiftAssignmentEmail } from "@/lib/email/templates/shift-assignment"
import { getShiftStart, getShiftEnd, buildGoogleCalendarUrl } from "@/lib/scheduling/shift-date"
import * as React from "react"

export const shiftNotifications = inngest.createFunction(
  {
    id: "shift-notifications",
    triggers: [{ event: "schedule/approved" }],
  },
  async ({ event, step }) => {
    const { scheduleId } = event.data as { scheduleId: string }

    const schedule = await step.run("load-schedule", () =>
      prisma.schedule.findUnique({
        where: { id: scheduleId },
        include: {
          location: true,
          shifts: {
            where: { employeeId: { not: null } },
            include: { shiftTemplate: true, employee: true },
          },
        },
      })
    )

    if (!schedule) return { error: "Schedule not found" }

    // Group shifts by employee
    const byEmployee = new Map<string, typeof schedule.shifts>()
    for (const shift of schedule.shifts) {
      if (!shift.employeeId || !shift.employee) continue
      const list = byEmployee.get(shift.employeeId) ?? []
      list.push(shift)
      byEmployee.set(shift.employeeId, list)
    }

    await step.run("send-notifications", async () => {
      for (const [, shifts] of byEmployee) {
        const employee = shifts[0].employee!
        const shiftEntries = await Promise.all(
          shifts.map(async (s) => {
            const acceptToken = await generateToken(employee.id, "ACCEPT_SHIFT", { shiftId: s.id }, 168)
            const declineToken = await generateToken(employee.id, "DECLINE_SHIFT", { shiftId: s.id }, 168)
            const swapToken = await generateToken(employee.id, "REQUEST_SWAP", { shiftId: s.id, requesterId: employee.id }, 168)
            const start = getShiftStart(new Date(schedule.weekStart), s.dayOfWeek, s.shiftTemplate.startTime)
            const end = getShiftEnd(new Date(schedule.weekStart), s.dayOfWeek, s.shiftTemplate.endTime)
            const calendarUrl = buildGoogleCalendarUrl({
              title: `${s.shiftTemplate.name} shift — ${schedule.location.name}`,
              start,
              end,
              description: `Scheduled shift at ${schedule.location.name}.`,
              location: schedule.location.name,
            })
            return {
              templateName: s.shiftTemplate.name,
              date: start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
              startTime: s.shiftTemplate.startTime,
              endTime: s.shiftTemplate.endTime,
              acceptUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${acceptToken.id}`,
              declineUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${declineToken.id}`,
              swapUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${swapToken.id}`,
              calendarUrl,
            }
          })
        )

        const weekLabel = new Date(schedule.weekStart).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        })

        await sendEmail({
          to: employee.email,
          subject: `Your shifts for ${schedule.location.name} — w/c ${weekLabel}`,
          react: React.createElement(ShiftAssignmentEmail, {
            employeeName: employee.name,
            locationName: schedule.location.name,
            weekLabel: `w/c ${weekLabel}`,
            shifts: shiftEntries,
          }),
        })
      }
    })

    // Transition schedule to PUBLISHED
    await step.run("publish-schedule", () =>
      prisma.schedule.update({
        where: { id: scheduleId },
        data: { status: "PUBLISHED" },
      })
    )

    return { notified: byEmployee.size }
  }
)

// Daily cron: send 24hr reminders for tomorrow's shifts
export const shiftReminders = inngest.createFunction(
  {
    id: "shift-reminders",
    triggers: [{ cron: "0 8 * * *" }],
  },
  async ({ step }) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const dayAfter = new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)

    const shifts = await step.run("find-tomorrow-shifts", () =>
      prisma.shift.findMany({
        where: {
          status: "ACCEPTED",
          schedule: { weekStart: { gte: tomorrow, lt: dayAfter } },
          employee: { isNot: null },
        },
        include: { shiftTemplate: true, employee: true, schedule: { include: { location: true } } },
      })
    )

    await step.run("send-reminders", async () => {
      for (const shift of shifts) {
        if (!shift.employee) continue
        await sendEmail({
          to: shift.employee.email,
          subject: `Reminder: ${shift.shiftTemplate.name} tomorrow at ${shift.schedule.location.name}`,
          react: React.createElement(
            (await import("@/lib/email/templates/notification")).NotificationEmail,
            {
              heading: "Shift reminder",
              body: `Don't forget — you're working ${shift.shiftTemplate.name} tomorrow (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) at ${shift.schedule.location.name}.`,
            }
          ),
        })
      }
    })

    return { reminded: shifts.length }
  }
)

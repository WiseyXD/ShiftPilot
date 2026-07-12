import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { generateToken } from "@/lib/tokens/generate"
import { sendEmail } from "@/lib/email/send"
import { ShiftAssignmentEmail } from "@/lib/email/templates/shift-assignment"
import { getShiftStart, getShiftEnd, buildGoogleCalendarUrl } from "@/lib/scheduling/shift-date"
import { notificationMode } from "@/lib/scheduling/categories"
import { pushAgentMessage } from "@/lib/whatsapp-sim/handler"
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
        const mode = notificationMode(employee.category)

        const shiftEntries = await Promise.all(
          shifts.map(async (s) => {
            const start = getShiftStart(new Date(schedule.weekStart), s.dayOfWeek, s.shiftTemplate.startTime)
            const end = getShiftEnd(new Date(schedule.weekStart), s.dayOfWeek, s.shiftTemplate.endTime)
            const calendarUrl = buildGoogleCalendarUrl({
              title: `${s.shiftTemplate.name} shift — ${schedule.location.name}`,
              start,
              end,
              description: `Scheduled shift at ${schedule.location.name}.`,
              location: schedule.location.name,
            })
            const base = {
              templateName: s.shiftTemplate.name,
              date: start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
              startTime: s.shiftTemplate.startTime,
              endTime: s.shiftTemplate.endTime,
              calendarUrl,
            }

            if (mode === "INFO_CHANGE_REQUEST") {
              // Category B can't decline — info only, plus a change request
              // that notifies the manager and changes nothing by itself.
              const changeToken = await generateToken(employee.id, "REQUEST_CHANGE", { shiftId: s.id }, 168)
              return {
                ...base,
                changeRequestUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${changeToken.id}`,
              }
            }

            const acceptToken = await generateToken(employee.id, "ACCEPT_SHIFT", { shiftId: s.id }, 168)
            const declineToken = await generateToken(employee.id, "DECLINE_SHIFT", { shiftId: s.id }, 168)
            const swapToken = await generateToken(employee.id, "REQUEST_SWAP", { shiftId: s.id, requesterId: employee.id }, 168)
            return {
              ...base,
              acceptUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${acceptToken.id}`,
              declineUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${declineToken.id}`,
              swapUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${swapToken.id}`,
            }
          })
        )

        // Category-B shifts don't await acceptance — they're set once notified.
        if (mode === "INFO_CHANGE_REQUEST") {
          await prisma.shift.updateMany({
            where: { id: { in: shifts.map((s) => s.id) }, status: "PENDING" },
            data: { status: "ACCEPTED" },
          })
        }

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
            mode,
          }),
        })

        // Simulator: DM the same plan into the employee's WhatsApp thread.
        // Category A gets tappable accept/decline; B gets an info line.
        const planLines = shifts
          .map((s) => {
            const start = getShiftStart(new Date(schedule.weekStart), s.dayOfWeek, s.shiftTemplate.startTime)
            const date = start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
            return `${date} · *${s.shiftTemplate.name}* ${s.shiftTemplate.startTime}–${s.shiftTemplate.endTime}`
          })
          .join("\n")
        await pushAgentMessage(
          schedule.locationId,
          employee.id,
          `📋 Your plan for ${weekLabel} at ${schedule.location.name}:\n\n${planLines}${
            mode === "INFO_CHANGE_REQUEST" ? "\n\nThese shifts are fixed." : ""
          }`
        )
        if (mode === "ACCEPT_DECLINE") {
          for (const s of shifts) {
            const start = getShiftStart(new Date(schedule.weekStart), s.dayOfWeek, s.shiftTemplate.startTime)
            const date = start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
            await pushAgentMessage(
              schedule.locationId,
              employee.id,
              `${date} · ${s.shiftTemplate.name} ${s.shiftTemplate.startTime}–${s.shiftTemplate.endTime} — accept?`,
              [
                { label: "✅ Accept", command: `ACCEPT:${s.id}` },
                { label: "❌ Decline", command: `DECLINE:${s.id}` },
              ]
            )
          }
        }
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

        // Simulator: same nudge in the employee's WhatsApp thread.
        await pushAgentMessage(
          shift.schedule.locationId,
          shift.employee.id,
          `⏰ Reminder: tomorrow you're on the *${shift.shiftTemplate.name}* shift (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) at ${shift.schedule.location.name}. See you then! ☕`
        )
      }
    })

    return { reminded: shifts.length }
  }
)

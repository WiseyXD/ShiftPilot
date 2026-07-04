import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { generateToken } from "@/lib/tokens/generate"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import { getShiftStart, formatShiftDate } from "@/lib/scheduling/shift-date"
import { canBackfill } from "@/lib/marketplace/roster"
import * as React from "react"

// How far ahead of shift start the check-in link goes out.
const LOOKAHEAD_MINUTES = 40

const currentMonday = () => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

// Every 30 min: find confirmed shifts starting within the lookahead window
// that haven't been sent a check-in link yet, and kick off a watch per shift.
export const checkInScheduler = inngest.createFunction(
  { id: "check-in-scheduler", triggers: [{ cron: "*/30 * * * *" }] },
  async ({ step }) => {
    const due = await step.run("find-imminent-shifts", async () => {
      const shifts = await prisma.shift.findMany({
        where: {
          status: { in: ["ACCEPTED", "REASSIGNED"] },
          employeeId: { not: null },
          checkInRequestedAt: null,
          schedule: { weekStart: currentMonday() },
        },
        include: {
          shiftTemplate: { select: { startTime: true } },
          schedule: { select: { weekStart: true } },
        },
      })
      const now = Date.now()
      const horizon = now + LOOKAHEAD_MINUTES * 60_000
      return shifts
        .filter((s) => {
          const start = getShiftStart(
            new Date(s.schedule.weekStart),
            s.dayOfWeek,
            s.shiftTemplate.startTime
          ).getTime()
          return start > now && start <= horizon
        })
        .map((s) => s.id)
    })

    for (const shiftId of due) {
      await step.run(`dispatch-${shiftId}`, async () => {
        await prisma.shift.update({ where: { id: shiftId }, data: { checkInRequestedAt: new Date() } })
        await inngest.send({ name: "shift/checkin-due", data: { shiftId } })
      })
    }

    return { dispatched: due.length }
  }
)

// Per shift: send the check-in link, wait durably for the tap, and call the
// no-show verdict X minutes (per-location grace) after shift start.
export const checkInWatch = inngest.createFunction(
  { id: "check-in-watch", triggers: [{ event: "shift/checkin-due" }] },
  async ({ event, step }) => {
    const { shiftId } = event.data as { shiftId: string }

    const shift = await step.run("load-shift", () =>
      prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          shiftTemplate: true,
          employee: true,
          schedule: { include: { location: { include: { owner: true } } } },
        },
      })
    )
    if (!shift || !shift.employee) return { error: "shift or employee gone" }
    // A lent-out shift is not ours to check in (and never backfilled).
    if (!canBackfill(shift.status) || (shift.status !== "ACCEPTED" && shift.status !== "REASSIGNED")) {
      return { skipped: `status ${shift.status}` }
    }

    const location = shift.schedule.location
    const start = getShiftStart(
      new Date(shift.schedule.weekStart),
      shift.dayOfWeek,
      shift.shiftTemplate.startTime
    )
    const dateLabel = formatShiftDate(start)
    const summary = `${shift.shiftTemplate.name} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) on ${dateLabel}`

    await step.run("send-check-in-link", async () => {
      const token = await generateToken(shift.employee!.id, "CHECK_IN", { shiftId }, 6)
      await sendEmail({
        to: shift.employee!.email,
        subject: `Check in: ${shift.shiftTemplate.name} at ${location.name}`,
        react: React.createElement(NotificationEmail, {
          heading: "Your shift starts soon — check in",
          body: `Hi ${shift.employee!.name}, your ${summary} at ${location.name} starts soon. Tap to check in when you arrive.`,
          ctaLabel: "I'm here — check in",
          ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/token/${token.id}`,
        }),
      })
    })

    // Wait until grace expires: minutes from now to (start + grace), floor 1.
    const graceEnd = start.getTime() + location.checkInGraceMinutes * 60_000
    const waitMinutes = Math.max(1, Math.ceil((graceEnd - Date.now()) / 60_000))
    const checkedIn = await step.waitForEvent("wait-check-in", {
      event: "shift/checked-in",
      match: "data.shiftId",
      timeout: `${waitMinutes}m`,
    })
    if (checkedIn) return { outcome: "checked_in" }

    const verdict = await step.run("no-show-verdict", async () => {
      // Guarded: only an un-checked-in, still-confirmed shift becomes NO_SHOW.
      const { count } = await prisma.shift.updateMany({
        where: { id: shiftId, checkedInAt: null, status: { in: ["ACCEPTED", "REASSIGNED"] } },
        data: { status: "NO_SHOW" },
      })
      if (count === 0) return false

      await prisma.auditLog.create({
        data: {
          locationId: location.id,
          action: "NO_SHOW",
          aiReasoning: `${shift.employee!.name} did not check in within ${location.checkInGraceMinutes} min of shift start`,
          candidatesConsidered: [{ employeeId: shift.employee!.id, shiftId }],
          outcome: "no_show",
        },
      })
      await sendEmail({
        to: location.owner.email,
        subject: `🚨 No-show: ${shift.employee!.name} — ${summary}`,
        react: React.createElement(NotificationEmail, {
          heading: "No-show detected",
          body: `${shift.employee!.name} didn't check in for the ${summary} at ${location.name}. An emergency replacement search has started.`,
          ctaLabel: "Open schedule",
          ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${location.id}/schedules/${shift.scheduleId}`,
        }),
      })
      // Same door as a decline — the replacement engine takes over.
      await inngest.send({ name: "shift/declined", data: { shiftId } })
      return true
    })

    return { outcome: verdict ? "no_show" : "already_settled" }
  }
)

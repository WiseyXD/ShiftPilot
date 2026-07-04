import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/prisma/client"
import { validateToken } from "@/lib/tokens/validate"
import { applyWorkerResponse } from "@/lib/marketplace/deals"
import { inngest } from "@/lib/inngest/client"
import { isInFreezeWindow } from "@/lib/scheduling/freeze"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import { getShiftStart, getShiftEnd, formatShiftDate, buildGoogleCalendarUrl } from "@/lib/scheduling/shift-date"
import * as React from "react"

async function handleAction(action: string, payload: unknown) {
  const p = payload as Record<string, string>

  switch (action) {
    case "ACCEPT_SHIFT": {
      // Refuse if the shift is no longer in PENDING — prevents an already-declined
      // employee from "un-declining" and overwriting a replacement.
      const current = await prisma.shift.findUnique({
        where: { id: p.shiftId },
        include: {
          shiftTemplate: true,
          employee: true,
          schedule: { include: { location: true } },
        },
      })
      if (!current) {
        return NextResponse.json({ error: "Shift not found" }, { status: 404 })
      }
      if (current.status !== "PENDING") {
        const reasonMap: Record<string, string> = {
          ACCEPTED: "You've already accepted this shift.",
          DECLINED: "You declined this shift — a replacement is being found. You can't un-decline.",
          REASSIGNED: "This shift has already been reassigned to someone else.",
          UNASSIGNED: "This shift is no longer assigned to you.",
        }
        return NextResponse.json(
          { error: reasonMap[current.status] ?? "Shift cannot be accepted." },
          { status: 409 }
        )
      }
      await prisma.shift.update({
        where: { id: p.shiftId },
        data: { status: "ACCEPTED" },
      })

      // Send a confirmation email with a "Add to Google Calendar" link
      if (current.employee) {
        const start = getShiftStart(new Date(current.schedule.weekStart), current.dayOfWeek, current.shiftTemplate.startTime)
        const end = getShiftEnd(new Date(current.schedule.weekStart), current.dayOfWeek, current.shiftTemplate.endTime)
        const calendarUrl = buildGoogleCalendarUrl({
          title: `${current.shiftTemplate.name} shift — ${current.schedule.location.name}`,
          start,
          end,
          description: `Confirmed shift at ${current.schedule.location.name}.`,
          location: current.schedule.location.name,
        })
        await sendEmail({
          to: current.employee.email,
          subject: `Confirmed: ${current.shiftTemplate.name} on ${formatShiftDate(start)}`,
          react: React.createElement(NotificationEmail, {
            heading: "Shift confirmed — see you then!",
            body: `Hi ${current.employee.name}, you're confirmed for the ${current.shiftTemplate.name} shift on ${formatShiftDate(start)} (${current.shiftTemplate.startTime}–${current.shiftTemplate.endTime}) at ${current.schedule.location.name}.`,
            ctaLabel: "Add to Google Calendar",
            ctaUrl: calendarUrl,
          }),
        })
      }

      await prisma.auditLog.create({
        data: {
          locationId: current.schedule.locationId,
          action: "SHIFT_ACCEPTED",
          aiReasoning: "",
          candidatesConsidered: [],
          outcome: `Shift ${p.shiftId} accepted`,
        },
      })
      return NextResponse.json({ ok: true, message: "Shift accepted. Check your inbox for a Google Calendar link." })
    }

    case "DECLINE_SHIFT": {
      // Check freeze window — sick calls bypass, declines do not
      const shiftWithSchedule = await prisma.shift.findUnique({
        where: { id: p.shiftId },
        include: { schedule: { include: { location: true } }, shiftTemplate: true },
      })
      if (!shiftWithSchedule) {
        return NextResponse.json({ error: "Shift not found" }, { status: 404 })
      }
      if (shiftWithSchedule.status !== "PENDING") {
        const reasonMap: Record<string, string> = {
          ACCEPTED: "You've already accepted this shift — contact your manager to change it.",
          DECLINED: "You've already declined this shift.",
          REASSIGNED: "This shift has already been reassigned.",
          UNASSIGNED: "This shift is no longer assigned to you.",
        }
        return NextResponse.json(
          { error: reasonMap[shiftWithSchedule.status] ?? "Shift cannot be declined." },
          { status: 409 }
        )
      }
      if (shiftWithSchedule) {
        const shiftDate = new Date(shiftWithSchedule.schedule.weekStart)
        // weekStart is Monday; offset by dayOfWeek (1=Mon offset 0 … 0=Sun offset 6)
        const offset = (shiftWithSchedule.dayOfWeek + 6) % 7
        shiftDate.setDate(shiftDate.getDate() + offset)
        const [h, m] = shiftWithSchedule.shiftTemplate.startTime.split(":").map(Number)
        shiftDate.setHours(h, m, 0, 0)

        const now = new Date()
        if (now > shiftDate) {
          return NextResponse.json(
            { error: "This shift has already started or ended — it can't be declined." },
            { status: 403 }
          )
        }
        if (isInFreezeWindow(shiftDate, shiftWithSchedule.schedule.location)) {
          return NextResponse.json(
            { error: `This shift starts in less than ${shiftWithSchedule.schedule.location.freezeWindowHours}h — contact your manager to make changes.` },
            { status: 403 }
          )
        }
      }
      await prisma.shift.update({
        where: { id: p.shiftId },
        data: { status: "DECLINED" },
      })
      await inngest.send({ name: "shift/declined", data: { shiftId: p.shiftId } })
      await prisma.auditLog.create({
        data: {
          locationId: await getLocationIdForShift(p.shiftId),
          action: "SHIFT_DECLINED",
          aiReasoning: "",
          candidatesConsidered: [],
          outcome: `Shift ${p.shiftId} declined — replacement search triggered`,
        },
      })
      return NextResponse.json({ ok: true, message: "Noted. We'll find someone to cover." })
    }

    case "REPORT_SICK": {
      const sickShift = await prisma.shift.findUnique({ where: { id: p.shiftId } })
      if (!sickShift) {
        return NextResponse.json({ error: "Shift not found" }, { status: 404 })
      }
      // A lent-out shift isn't the lender's to cover — no decline, no backfill.
      if (sickShift.status === "LENT_OUT") {
        return NextResponse.json(
          { error: "This shift is lent out to another venue — talk to your manager directly." },
          { status: 409 }
        )
      }
      await prisma.shift.update({
        where: { id: p.shiftId },
        data: { status: "DECLINED" },
      })
      await inngest.send({ name: "shift/sick-call", data: { shiftId: p.shiftId } })
      // The report stays open until the manager confirms they know — the nag
      // loop (reminders + red banner) starts here.
      if (sickShift.employeeId) {
        const sickCall = await prisma.sickCall.create({
          data: {
            locationId: await getLocationIdForShift(p.shiftId),
            shiftId: p.shiftId,
            employeeId: sickShift.employeeId,
          },
        })
        await inngest.send({ name: "sick/reported", data: { sickCallId: sickCall.id } })
      }
      return NextResponse.json({
        ok: true,
        message:
          "Feel better soon. We'll handle coverage — please also tell your manager personally.",
      })
    }

    case "REQUEST_SWAP": {
      const swapShift = await prisma.shift.findUnique({ where: { id: p.shiftId } })
      if (!swapShift) {
        return NextResponse.json({ error: "Shift not found" }, { status: 404 })
      }
      if (swapShift.status === "LENT_OUT") {
        return NextResponse.json(
          { error: "This shift is lent out to another venue — it can't be swapped." },
          { status: 409 }
        )
      }
      const swapRequest = await prisma.swapRequest.create({
        data: { shiftId: p.shiftId, requesterId: p.requesterId },
      })
      await inngest.send({ name: "swap/requested", data: { swapRequestId: swapRequest.id } })
      return NextResponse.json({ ok: true, message: "Swap request submitted. We'll find a replacement." })
    }

    case "ACCEPT_SWAP":
    case "DECLINE_SWAP":
      await inngest.send({ name: "swap/response", data: { ...p, response: action } })
      return NextResponse.json({ ok: true, message: action === "ACCEPT_SWAP" ? "Great! We'll confirm the swap shortly." : "No problem. We'll ask someone else." })

    case "APPROVE_SWAP":
    case "REJECT_SWAP":
      await inngest.send({ name: "swap/manager-response", data: { ...p, response: action } })
      return NextResponse.json({ ok: true, message: action === "APPROVE_SWAP" ? "Swap approved." : "Swap rejected." })

    case "CONFIRM_SICK": {
      // Guarded: confirm exactly once; a second click is told so.
      const { count } = await prisma.sickCall.updateMany({
        where: { id: p.sickCallId, confirmedAt: null },
        data: { confirmedAt: new Date() },
      })
      if (count === 0) {
        return NextResponse.json(
          { error: "This sick call was already confirmed." },
          { status: 409 }
        )
      }
      await inngest.send({ name: "sick/confirmed", data: { sickCallId: p.sickCallId } })
      const confirmed = await prisma.sickCall.findUnique({ where: { id: p.sickCallId } })
      if (confirmed) {
        await prisma.auditLog.create({
          data: {
            locationId: confirmed.locationId,
            action: "SICK_CALL_CONFIRMED",
            aiReasoning: "",
            candidatesConsidered: [],
            outcome: `Sick call ${confirmed.id} confirmed by manager`,
          },
        })
      }
      return NextResponse.json({ ok: true, message: "Confirmed — thanks. Reminders stop now." })
    }

    case "REQUEST_CHANGE": {
      // Category-B employees can't decline — this only informs the manager.
      // Nothing on the shift changes; the manager decides.
      const shift = await prisma.shift.findUnique({
        where: { id: p.shiftId },
        include: {
          shiftTemplate: true,
          employee: true,
          schedule: { include: { location: { include: { owner: true } } } },
        },
      })
      if (!shift || !shift.employee) {
        return NextResponse.json({ error: "Shift not found" }, { status: 404 })
      }
      const start = getShiftStart(new Date(shift.schedule.weekStart), shift.dayOfWeek, shift.shiftTemplate.startTime)
      await sendEmail({
        to: shift.schedule.location.owner.email,
        subject: `Change request: ${shift.employee.name} — ${shift.shiftTemplate.name} on ${formatShiftDate(start)}`,
        react: React.createElement(NotificationEmail, {
          heading: "An employee requests a shift change",
          body: `${shift.employee.name} asks to change their ${shift.shiftTemplate.name} shift on ${formatShiftDate(start)} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) at ${shift.schedule.location.name}. The shift stays assigned until you decide.`,
          ctaLabel: "View schedule",
          ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${shift.schedule.locationId}/schedules/${shift.scheduleId}`,
        }),
      })
      await prisma.auditLog.create({
        data: {
          locationId: shift.schedule.locationId,
          action: "CHANGE_REQUESTED",
          aiReasoning: "",
          candidatesConsidered: [],
          outcome: `${shift.employee.name} requested a change for shift ${shift.id}`,
        },
      })
      return NextResponse.json({
        ok: true,
        message: "Your manager has been notified. The shift stays yours until they decide.",
      })
    }

    case "ACCEPT_LOAN":
    case "DECLINE_LOAN": {
      const deal = await prisma.sharingDeal.findUnique({ where: { id: p.dealId } })
      if (!deal) {
        return NextResponse.json({ error: "This loan no longer exists." }, { status: 404 })
      }
      const transition = applyWorkerResponse(deal.status, action)
      if (!transition.ok) {
        return NextResponse.json({ error: transition.error }, { status: 409 })
      }
      // The DB is the source of truth (WhatsApp taps land here too) — mutate
      // first, guarded against a racing click on the other link, then wake the
      // waiting workflow to send the notifications.
      const { count } = await prisma.sharingDeal.updateMany({
        where: { id: deal.id, status: "MANAGERS_AGREED" },
        data: { status: transition.next },
      })
      if (count === 0) {
        return NextResponse.json({ error: "This loan was already answered." }, { status: 409 })
      }
      if (transition.next === "WORKER_DECLINED") {
        await prisma.sharingListing.updateMany({
          where: { id: deal.listingId, status: "MATCHED" },
          data: { status: "OPEN" },
        })
      }
      await inngest.send({
        name: "marketplace/loan.response",
        data: { dealId: deal.id, response: action },
      })
      return NextResponse.json({
        ok: true,
        message:
          action === "ACCEPT_LOAN"
            ? "You're on! Both venues have been notified — see you there."
            : "No problem — we've let both managers know.",
      })
    }

    default:
      return NextResponse.json({ ok: true, action })
  }
}

async function getLocationIdForShift(shiftId: string): Promise<string> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { schedule: true },
  })
  return shift?.schedule.locationId ?? "unknown"
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const { tokenId } = await params

  const token = await prisma.actionToken.findUnique({
    where: { id: tokenId },
  })

  const result = validateToken(token)

  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "expired" ? 410 : 409
    return NextResponse.json({ error: result.reason }, { status })
  }

  await prisma.actionToken.update({
    where: { id: tokenId },
    data: { usedAt: new Date() },
  })

  return handleAction(result.action, result.payload)
}

// GET for one-click email links
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const { tokenId } = await params
  const token = await prisma.actionToken.findUnique({ where: { id: tokenId } })

  const result = validateToken(token)

  if (!result.ok) {
    const messages: Record<string, string> = {
      not_found: "This link is invalid.",
      expired: "This link has expired.",
      consumed: "This action has already been completed.",
    }
    return new Response(
      `<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>${messages[result.reason]}</h2></body></html>`,
      { headers: { "content-type": "text/html" } }
    )
  }

  const response = await handleAction(result.action, result.payload)
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    return new Response(
      `<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2 style="color:#dc2626">${data.error ?? "Action failed"}</h2><p style="color:#64748b">The link is still valid — try again or contact your manager.</p></body></html>`,
      { headers: { "content-type": "text/html" } }
    )
  }

  await prisma.actionToken.update({ where: { id: tokenId }, data: { usedAt: new Date() } })
  return new Response(
    `<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2 style="color:#16a34a">${data.message ?? "Done!"}</h2></body></html>`,
    { headers: { "content-type": "text/html" } }
  )
}

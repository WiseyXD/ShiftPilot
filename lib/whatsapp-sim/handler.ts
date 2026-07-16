// The simulator's backend brain. Turns an employee's message into real,
// guarded actions on the real schedule (same status guards and Inngest events
// as the email/token path) and an agent reply. Also exposes pushAgentMessage,
// which proactive sources (schedule approval, replacement outreach) use to DM
// an employee's thread.

import { prisma } from "@/prisma/client"
import { inngest } from "@/lib/inngest/client"
import { sendWhatsApp, whatsappEnabled } from "@/lib/whatsapp/cloud"
import { getShiftStart, getShiftEnd, formatShiftDate } from "@/lib/scheduling/shift-date"
import { checkEmployeeAssignment } from "@/lib/compliance/check"
import { loadRules } from "@/lib/compliance/load"
import { needsAvailability } from "@/lib/scheduling/categories"
import { computeShiftCandidates } from "@/lib/scheduling/candidates"
import { pushOwnerMessage, ownerThreadLanguage } from "@/lib/agent/owner-thread"
import { t, fmtDay } from "@/lib/agent/i18n"
import { routeMessage } from "./agent"

export interface ChatAction {
  label: string
  command: string
}

// A missing Inngest dev server must not 500 the chat — the DB mutation already
// happened; only the durable follow-up (replacement search) would be skipped.
async function safeSend(event: { name: string; data: Record<string, unknown> }) {
  try {
    await inngest.send(event)
  } catch (err) {
    console.error("inngest.send failed (simulator continues):", err)
  }
}

const currentMonday = () => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

type ShiftWithCtx = {
  id: string
  status: string
  dayOfWeek: number
  employeeId: string | null
  shiftTemplate: { name: string; startTime: string; endTime: string; requiredRoles: string[] }
  schedule: { weekStart: Date; locationId: string }
}

const shiftLine = (s: ShiftWithCtx) => {
  const start = getShiftStart(new Date(s.schedule.weekStart), s.dayOfWeek, s.shiftTemplate.startTime)
  return `${formatShiftDate(start)} · *${s.shiftTemplate.name}* ${s.shiftTemplate.startTime}–${s.shiftTemplate.endTime}`
}

// ── Persistence ──────────────────────────────────────────────────────────────

export async function pushAgentMessage(
  locationId: string,
  employeeId: string,
  body: string,
  actions?: ChatAction[]
) {
  await prisma.chatMessage.create({
    data: {
      locationId,
      employeeId,
      role: "AGENT",
      body,
      actions: actions ? (actions as unknown as object[]) : undefined,
    },
  })

  // Mirror to the real WhatsApp number when the channel is on. Best-effort:
  // sendWhatsApp never throws, so a Meta outage can't fail the Inngest step
  // this runs inside.
  if (whatsappEnabled()) {
    const e = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { phone: true },
    })
    await sendWhatsApp(e?.phone, body, actions)
  }
}

// Returns false if this is a duplicate delivery of a WhatsApp message we've
// already processed (Meta retries until it sees a 200). The unique index on
// waMessageId is the guard — without it a retried "SICK:" would kick off the
// replacement engine twice.
async function pushEmployeeMessage(
  locationId: string,
  employeeId: string,
  body: string,
  waMessageId?: string
): Promise<boolean> {
  try {
    await prisma.chatMessage.create({
      data: { locationId, employeeId, role: "EMPLOYEE", body, waMessageId },
    })
    return true
  } catch (err) {
    // P2002 = unique violation on waMessageId: Meta re-delivered a message we
    // already handled. Anything else is a real failure and must surface.
    if (waMessageId && (err as { code?: string } | null)?.code === "P2002") return false
    throw err
  }
}

// ── Manager cover request (consent flow) ─────────────────────────────────────
// The copilot's request_cover tool calls this: instead of force-assigning, it
// asks the target employee on WhatsApp. Only when they tap Yes (MGRCOVER_YES)
// does the schedule change. Hard-legal-blocked before we even ask.
export async function requestManagerCover(
  locationId: string,
  shiftId: string,
  targetEmployeeId: string
): Promise<{ error: string } | { ok: true; employeeName: string; shiftLabel: string }> {
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, schedule: { locationId } },
    include: {
      shiftTemplate: true,
      employee: { select: { name: true } },
      schedule: { select: { weekStart: true } },
    },
  })
  if (!shift) return { error: "That shift no longer exists." }
  if (shift.status === "LENT_OUT") return { error: "That shift is lent out to another venue — resolve the loan first." }

  const employee = await prisma.employee.findFirst({ where: { id: targetEmployeeId, locationId } })
  if (!employee) return { error: "That employee isn't at this location." }

  const weekStart = new Date(shift.schedule.weekStart)
  const start = getShiftStart(weekStart, shift.dayOfWeek, shift.shiftTemplate.startTime)
  const end = getShiftEnd(weekStart, shift.dayOfWeek, shift.shiftTemplate.endTime)
  const shiftLabel = `${shift.shiftTemplate.name} on ${formatShiftDate(start)}`

  // Hard legal wall — never ask someone to work an illegal shift.
  const rules = await loadRules(weekStart)
  const otherShifts = (await prisma.shift.findMany({
    where: {
      employeeId: employee.id,
      scheduleId: shift.scheduleId,
      id: { not: shiftId },
      status: { notIn: ["DECLINED", "UNASSIGNED"] },
    },
    include: { shiftTemplate: { select: { startTime: true, endTime: true } } },
  })) as { dayOfWeek: number; shiftTemplate: { startTime: string; endTime: string } }[]
  const existing = otherShifts.map((s) => ({
    start: getShiftStart(weekStart, s.dayOfWeek, s.shiftTemplate.startTime),
    end: getShiftEnd(weekStart, s.dayOfWeek, s.shiftTemplate.endTime),
  }))
  const violation = checkEmployeeAssignment(employee, { start, end }, existing, rules)
  if (violation) return { error: `That would break ${violation.rule}: ${violation.detail}.` }

  await pushAgentMessage(
    locationId,
    employee.id,
    `🙋 Your manager would like you to cover the *${shift.shiftTemplate.name}* shift on ${formatShiftDate(start)} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime})${
      shift.employee ? ` — currently ${shift.employee.name}'s` : ""
    }. Can you take it?`,
    [
      { label: "🙋 Yes, I can", command: `MGRCOVER_YES:${shiftId}` },
      { label: "No", command: `MGRCOVER_NO:${shiftId}` },
    ]
  )
  return { ok: true, employeeName: employee.name, shiftLabel }
}

// ── Instant sick-call cover ──────────────────────────────────────────────────
// Runs the replacement search synchronously the moment a sick call lands in
// chat: same ranking, same compliance wall, same audit trail as the Inngest
// engine — minus the per-step round trips. The cover ask reuses the
// MGRCOVER_YES/NO consent flow, so the accept path (compliance re-check,
// reassign, confirmations, owner notification) already exists above.
async function instantSickCover(locationId: string, shiftId: string) {
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, schedule: { locationId } },
    include: {
      shiftTemplate: true,
      employee: { select: { name: true } },
      schedule: { include: { shifts: { include: { shiftTemplate: true } } } },
    },
  })
  if (!shift) return

  const weekStart = new Date(shift.schedule.weekStart)
  const start = getShiftStart(weekStart, shift.dayOfWeek, shift.shiftTemplate.startTime)
  const lang = await ownerThreadLanguage(locationId)
  await pushOwnerMessage(
    locationId,
    t(lang).sickCallPush(
      shift.employee?.name ?? "An employee",
      shift.shiftTemplate.name,
      fmtDay(lang, start)
    )
  )

  const candidates = await computeShiftCandidates({
    locationId,
    shift,
    excludeEmployeeId: shift.employeeId ?? "none",
  })

  if (candidates.length === 0) {
    await pushOwnerMessage(
      locationId,
      t(lang).replacementFailed(shift.shiftTemplate.name, fmtDay(lang, start), 0)
    )
    return
  }

  const top = candidates[0]
  await pushAgentMessage(
    locationId,
    top.employeeId,
    `🔔 Can you cover? The *${shift.shiftTemplate.name}* shift on ${formatShiftDate(start)} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}) just opened up.`,
    [
      { label: "🙋 Yes, I can", command: `MGRCOVER_YES:${shiftId}` },
      { label: "No", command: `MGRCOVER_NO:${shiftId}` },
    ]
  )
  await prisma.auditLog.create({
    data: {
      locationId,
      action: "REPLACEMENT_OUTREACH",
      aiReasoning: `Instant sick-call outreach: ${top.name} (priority ${top.priority}, fairness ${top.fairnessScore.toFixed(2)})`,
      candidatesConsidered: [{ employeeId: top.employeeId, priority: top.priority }],
      outcome: "outreach_sent",
    },
  })
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * The single front door for anything an employee says — the in-app simulator
 * and the real WhatsApp webhook both land here, so there is exactly one set of
 * guards.
 *
 * `text` is what gets routed (for a tapped button that's the raw command, e.g.
 * "SICK:ckabc"). `display` is what gets written to the thread — WhatsApp gives
 * us the button's human title alongside its id, so the transcript on the
 * projector reads "🤒 Call in sick" instead of "SICK:cmg1x7…".
 * `waMessageId` dedupes Meta's retried deliveries.
 */
export async function handleEmployeeMessage(
  employeeId: string,
  text: string,
  opts?: { display?: string; waMessageId?: string }
) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
  if (!employee) return

  const fresh = await pushEmployeeMessage(
    employee.locationId,
    employeeId,
    opts?.display ?? text,
    opts?.waMessageId
  )
  if (!fresh) return // already processed this WhatsApp message

  let intent = routeMessage(text)

  // While a weekly availability ask is open, a free-form sentence (or an
  // ambiguous "can't"/"sick" line) is almost certainly them answering it —
  // parse it as unavailability before falling through to sick/help routing.
  // Tapped buttons (COMMAND) always run as-is.
  if (intent.kind !== "COMMAND" && (intent.kind === "UNKNOWN" || intent.kind === "SICK")) {
    const pendingWeek = await pendingAvailabilityWeek(employeeId)
    if (pendingWeek) {
      await handleAvailabilityText(employee.locationId, employeeId, text, pendingWeek)
      return
    }
  }

  // Free-form → let the LLM map it onto a known intent (never mutate directly).
  if (intent.kind === "UNKNOWN") {
    intent = await classifyWithLLM(intent.text)
  }

  switch (intent.kind) {
    case "COMMAND":
      await runCommand(employee.locationId, employeeId, intent.command, intent.arg)
      return
    case "MY_SHIFTS":
      await replyMyShifts(employee.locationId, employeeId)
      return
    case "OPEN_SHIFTS":
      await replyOpenShifts(employee.locationId, employeeId)
      return
    case "SICK":
      await replySickPicker(employee.locationId, employeeId)
      return
    default:
      await replyHelp(employee.locationId, employeeId, employee.name)
  }
}

// ── Intent replies ───────────────────────────────────────────────────────────

async function loadEmployeeShifts(employeeId: string, statuses: string[]) {
  const shifts = (await prisma.shift.findMany({
    where: {
      employeeId,
      status: { in: statuses as never },
      schedule: { weekStart: { gte: currentMonday() } },
    },
    include: { shiftTemplate: true, schedule: { select: { weekStart: true, locationId: true } } },
    orderBy: [{ schedule: { weekStart: "asc" } }, { dayOfWeek: "asc" }],
  })) as unknown as ShiftWithCtx[]

  // weekStart >= this Monday still includes days of THIS week that have already
  // been and gone — you cannot call in sick for last Tuesday. Filter on the
  // shift's real start, which only weekStart + dayOfWeek + startTime can give us.
  const now = new Date()
  return shifts.filter(
    (s) => getShiftStart(new Date(s.schedule.weekStart), s.dayOfWeek, s.shiftTemplate.startTime) > now
  )
}

// "Tue 21 Jul · Evening" — 20 chars, which is WhatsApp's REPLY BUTTON title
// limit, not the roomier 24 of a list row. The sick picker shows one button per
// upcoming shift, and Niko normally has exactly one, so the button path is the
// one that matters: budget for 20 or the label lands truncated on his phone.
// en-GB renders "Tue, 21 Jul" — the comma is a char we can't spare.
//
// Drops the generic suffix either language spells it with ("Abendschicht" →
// "Abend", "Evening Shift" → "Evening"); templates named neither way pass
// through and clamp() catches anything still too long.
const shortShiftLabel = (s: ShiftWithCtx) => {
  const start = getShiftStart(new Date(s.schedule.weekStart), s.dayOfWeek, s.shiftTemplate.startTime)
  const when = start
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .replace(",", "")
  return `${when} · ${s.shiftTemplate.name.replace(/(schicht|\s+shift)$/i, "")}`
}

async function replyMyShifts(locationId: string, employeeId: string) {
  const shifts = await loadEmployeeShifts(employeeId, ["PENDING", "ACCEPTED", "REASSIGNED"])
  if (shifts.length === 0) {
    await pushAgentMessage(locationId, employeeId, "You have no shifts scheduled right now. 🌿")
    return
  }
  const lines = shifts.map((s) => {
    const mark = s.status === "PENDING" ? "🕓 pending" : s.status === "REASSIGNED" ? "🔁 covered" : "✅ confirmed"
    return `${shiftLine(s)} — ${mark}`
  })
  await pushAgentMessage(
    locationId,
    employeeId,
    `Your shifts:\n\n${lines.join("\n")}`
  )
  // One follow-up per shift: pending gets accept/decline, everything gets a
  // swap option so they can hand a shift off to a coworker.
  for (const s of shifts) {
    const actions: ChatAction[] =
      s.status === "PENDING"
        ? [
            { label: "✅ Accept", command: `ACCEPT:${s.id}` },
            { label: "❌ Decline", command: `DECLINE:${s.id}` },
            { label: "🔁 Swap", command: `SWAP:${s.id}` },
          ]
        : [{ label: "🔁 Swap", command: `SWAP:${s.id}` }]
    await pushAgentMessage(locationId, employeeId, `${shiftLine(s)}`, actions)
  }
}

async function replyOpenShifts(locationId: string, employeeId: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
  const open = (await prisma.shift.findMany({
    where: { status: "UNASSIGNED", schedule: { locationId, weekStart: { gte: currentMonday() } } },
    include: { shiftTemplate: true, schedule: { select: { weekStart: true, locationId: true } } },
    orderBy: [{ schedule: { weekStart: "asc" } }, { dayOfWeek: "asc" }],
  })) as unknown as ShiftWithCtx[]

  const eligible = open.filter((s) => {
    const roles = s.shiftTemplate.requiredRoles
    return roles.length === 0 || roles.some((r) => employee?.roles.includes(r))
  })

  if (eligible.length === 0) {
    await pushAgentMessage(locationId, employeeId, "No open shifts for you right now. I'll ping you as soon as one frees up! 👍")
    return
  }
  await pushAgentMessage(
    locationId,
    employeeId,
    `These shifts are still open — tap to take one:\n\n${eligible.map((s) => shiftLine(s)).join("\n")}`,
    eligible.map((s) => ({ label: shortShiftLabel(s), command: `TAKE:${s.id}` }))
  )
}

async function replySickPicker(locationId: string, employeeId: string) {
  const shifts = await loadEmployeeShifts(employeeId, ["PENDING", "ACCEPTED"])
  if (shifts.length === 0) {
    await pushAgentMessage(locationId, employeeId, "You have no upcoming shifts to cancel. Get well soon anyway! 🍵")
    return
  }
  // One message, one option per shift — not a message per shift. Past three
  // options this becomes a WhatsApp list (see buildPayload), which keeps the
  // thread readable instead of a wall of near-identical bubbles.
  await pushAgentMessage(
    locationId,
    employeeId,
    `Which shift are you calling in sick for?\n\n${shifts.map((s) => shiftLine(s)).join("\n")}`,
    shifts.map((s) => ({ label: shortShiftLabel(s), command: `SICK:${s.id}` }))
  )
}

async function replyHelp(locationId: string, employeeId: string, name: string) {
  await pushAgentMessage(
    locationId,
    employeeId,
    `Hi ${name.split(" ")[0]}! 👋 I'm Covrly, your shift assistant. I can:\n\n• *"my shifts"* — show your schedule\n• *"open"* — open shifts to pick up\n• *"sick"* — call in sick\n\nJust tell me what you need.`,
    [
      { label: "📋 My shifts", command: "MENU:MY_SHIFTS" },
      { label: "🙋 Open shifts", command: "MENU:OPEN_SHIFTS" },
      { label: "🤒 Call in sick", command: "MENU:SICK" },
    ]
  )
}

// ── Commands (guarded mutations) ─────────────────────────────────────────────

async function runCommand(locationId: string, employeeId: string, command: string, arg: string) {
  switch (command) {
    case "MENU":
      // A menu chip re-enters the matching intent.
      if (arg === "MY_SHIFTS") return replyMyShifts(locationId, employeeId)
      if (arg === "OPEN_SHIFTS") return replyOpenShifts(locationId, employeeId)
      if (arg === "SICK") return replySickPicker(locationId, employeeId)
      return replyHelp(locationId, employeeId, "")

    case "ACCEPT": {
      const shift = await getOwnShift(arg, employeeId)
      if (!shift) return notYours(locationId, employeeId)
      if (shift.status !== "PENDING") return alreadyHandled(locationId, employeeId, shift.status)
      await prisma.shift.update({ where: { id: arg }, data: { status: "ACCEPTED" } })
      await audit(locationId, "SHIFT_ACCEPTED", `Shift ${arg} accepted via WhatsApp`)
      await pushAgentMessage(locationId, employeeId, `✅ Confirmed! ${shiftLine(shift)}. See you then! ☕`)
      return
    }

    case "DECLINE": {
      const shift = await getOwnShift(arg, employeeId)
      if (!shift) return notYours(locationId, employeeId)
      if (shift.status !== "PENDING") return alreadyHandled(locationId, employeeId, shift.status)
      await prisma.shift.update({ where: { id: arg }, data: { status: "DECLINED" } })
      await safeSend({ name: "shift/declined", data: { shiftId: arg } })
      await audit(locationId, "SHIFT_DECLINED", `Shift ${arg} declined via WhatsApp — replacement triggered`)
      await pushAgentMessage(locationId, employeeId, `Got it — I've cancelled the shift and I'm finding cover right away. 🔎`)
      return
    }

    case "SICK": {
      const shift = await getOwnShift(arg, employeeId)
      if (!shift) return notYours(locationId, employeeId)
      if (shift.status === "LENT_OUT") return notYours(locationId, employeeId)
      await prisma.shift.update({ where: { id: arg }, data: { status: "DECLINED" } })
      const sickCall = await prisma.sickCall.create({
        data: { locationId, shiftId: arg, employeeId },
      })
      // sick/reported still drives the manager's email-confirmation nag loop.
      // origin:"chat" tells it the copilot thread is already notified (below),
      // so it must not post a duplicate a few minutes later.
      await safeSend({ name: "sick/reported", data: { sickCallId: sickCall.id, origin: "chat" } })
      await pushAgentMessage(
        locationId,
        employeeId,
        `Get well soon! 🤒 I've let your manager know and I'm already looking for cover. Please also give them a quick personal heads-up.`
      )
      // NO shift/sick-call event, deliberately: the Inngest replacement engine
      // pays a full round trip per step, which in production stretched this
      // exact flow to 10+ minutes. A sick colleague's phone-to-phone cover ask
      // must land in seconds, so the search runs synchronously here. The
      // engine still serves the email-token and copilot paths.
      await instantSickCover(locationId, arg)
      return
    }

    case "TAKE": {
      const shift = (await prisma.shift.findUnique({
        where: { id: arg },
        include: { shiftTemplate: true, schedule: { select: { weekStart: true, locationId: true } } },
      })) as unknown as ShiftWithCtx | null
      if (!shift || shift.schedule.locationId !== locationId) return notYours(locationId, employeeId)
      if (shift.status !== "UNASSIGNED") return alreadyHandled(locationId, employeeId, shift.status)

      // Same compliance wall as the scheduler — never book an illegal shift.
      const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
      const weekStart = new Date(shift.schedule.weekStart)
      const rules = await loadRules(weekStart)
      const otherShifts = (await prisma.shift.findMany({
        where: {
          employeeId,
          scheduleId: { not: undefined },
          status: { notIn: ["DECLINED", "UNASSIGNED"] },
          schedule: { weekStart },
        },
        include: { shiftTemplate: { select: { startTime: true, endTime: true } } },
      })) as { dayOfWeek: number; shiftTemplate: { startTime: string; endTime: string } }[]
      const existing = otherShifts.map((s) => ({
        start: getShiftStart(weekStart, s.dayOfWeek, s.shiftTemplate.startTime),
        end: getShiftEnd(weekStart, s.dayOfWeek, s.shiftTemplate.endTime),
      }))
      const candidate = {
        start: getShiftStart(weekStart, shift.dayOfWeek, shift.shiftTemplate.startTime),
        end: getShiftEnd(weekStart, shift.dayOfWeek, shift.shiftTemplate.endTime),
      }
      const violation = employee
        ? checkEmployeeAssignment(employee, candidate, existing, rules)
        : null
      if (violation) {
        await pushAgentMessage(
          locationId,
          employeeId,
          `That won't work — ${violation.detail}. (working-time law)`
        )
        return
      }

      const { count } = await prisma.shift.updateMany({
        where: { id: arg, status: "UNASSIGNED" },
        data: { employeeId, status: "ACCEPTED" },
      })
      if (count === 0) return alreadyHandled(locationId, employeeId, "ACCEPTED")
      await audit(locationId, "SHIFT_ACCEPTED", `Open shift ${arg} taken via WhatsApp`)
      await pushAgentMessage(locationId, employeeId, `🙌 It's yours: ${shiftLine(shift)}. Thanks for stepping in!`)
      return
    }

    case "COVER": {
      // Yes to a cover request — resolve the replacement engine's wait.
      await safeSend({ name: "swap/response", data: { shiftId: arg, response: "ACCEPT_SWAP" } })
      await pushAgentMessage(locationId, employeeId, `🙌 Thanks! I'll confirm the cover shortly.`)
      return
    }

    case "NOCOVER":
      await pushAgentMessage(locationId, employeeId, `No problem, thanks for letting me know. 👍`)
      return

    case "COVER_SWAP": {
      // Yes to a swap request — resolve the swap broker's wait (matched by
      // swapRequestId, unlike a plain replacement which matches shiftId).
      await safeSend({ name: "swap/response", data: { swapRequestId: arg, response: "ACCEPT_SWAP" } })
      await pushAgentMessage(locationId, employeeId, `🙌 Thanks! I'll confirm the swap shortly.`)
      return
    }

    case "SWAP": {
      const shift = await getOwnShift(arg, employeeId)
      if (!shift) return notYours(locationId, employeeId)
      if (shift.status === "LENT_OUT") return notYours(locationId, employeeId)
      if (!["PENDING", "ACCEPTED", "REASSIGNED"].includes(shift.status))
        return alreadyHandled(locationId, employeeId, shift.status)
      const swapRequest = await prisma.swapRequest.create({
        data: { shiftId: arg, requesterId: employeeId },
      })
      await safeSend({ name: "swap/requested", data: { swapRequestId: swapRequest.id } })
      await audit(locationId, "SWAP_REQUESTED", `Swap requested for shift ${arg} via WhatsApp`)
      await pushAgentMessage(
        locationId,
        employeeId,
        `Got it — I'll ask the team who can take the *${shift.shiftTemplate.name}* shift. 🔁`
      )
      return
    }

    case "MGRCOVER_NO": {
      await pushAgentMessage(locationId, employeeId, `No problem — thanks for the quick reply. 👍`)
      const shift = await prisma.shift.findUnique({
        where: { id: arg },
        include: { shiftTemplate: true, employee: { select: { name: true } }, schedule: { select: { weekStart: true } } },
      })
      const me = await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } })
      if (shift) {
        const start = getShiftStart(new Date(shift.schedule.weekStart), shift.dayOfWeek, shift.shiftTemplate.startTime)
        await pushOwnerMessage(
          locationId,
          `🙅 ${me?.name ?? "They"} can't cover the *${shift.shiftTemplate.name}* shift on ${formatShiftDate(start)}${
            shift.employee ? ` — it stays with ${shift.employee.name}` : " — it's still open"
          }.`
        )
      }
      return
    }

    case "MGRCOVER_YES": {
      const shift = await prisma.shift.findFirst({
        where: { id: arg, schedule: { locationId } },
        include: {
          shiftTemplate: true,
          employee: { select: { id: true, name: true } },
          schedule: { select: { weekStart: true, locationId: true } },
        },
      })
      if (!shift) return notYours(locationId, employeeId)
      if (shift.status === "LENT_OUT") return notYours(locationId, employeeId)
      // Someone else already covered it — a second Yes must not steal the shift.
      if (shift.status === "REASSIGNED" && shift.employee?.id !== employeeId)
        return alreadyHandled(locationId, employeeId, shift.status)

      // Same compliance wall as the scheduler — never book an illegal shift.
      const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
      const weekStart = new Date(shift.schedule.weekStart)
      const rules = await loadRules(weekStart)
      const otherShifts = (await prisma.shift.findMany({
        where: {
          employeeId,
          scheduleId: shift.scheduleId,
          id: { not: arg },
          status: { notIn: ["DECLINED", "UNASSIGNED"] },
        },
        include: { shiftTemplate: { select: { startTime: true, endTime: true } } },
      })) as { dayOfWeek: number; shiftTemplate: { startTime: string; endTime: string } }[]
      const existing = otherShifts.map((s) => ({
        start: getShiftStart(weekStart, s.dayOfWeek, s.shiftTemplate.startTime),
        end: getShiftEnd(weekStart, s.dayOfWeek, s.shiftTemplate.endTime),
      }))
      const candidate = {
        start: getShiftStart(weekStart, shift.dayOfWeek, shift.shiftTemplate.startTime),
        end: getShiftEnd(weekStart, shift.dayOfWeek, shift.shiftTemplate.endTime),
      }
      const violation = employee ? checkEmployeeAssignment(employee, candidate, existing, rules) : null
      const start = getShiftStart(weekStart, shift.dayOfWeek, shift.shiftTemplate.startTime)
      if (violation) {
        await pushAgentMessage(
          locationId,
          employeeId,
          `Ah — that would break the rules (${violation.detail}). I've let your manager know.`
        )
        await pushOwnerMessage(
          locationId,
          `⚠️ ${employee?.name ?? "Someone"} offered to cover the *${shift.shiftTemplate.name}* shift on ${formatShiftDate(start)}, but it's blocked: ${violation.detail}.`
        )
        return
      }

      const previous = shift.employee
      await prisma.shift.update({ where: { id: arg }, data: { employeeId, status: "REASSIGNED" } })
      await audit(locationId, "SHIFT_REASSIGNED", `Manager cover accepted: shift ${arg} → ${employeeId} via WhatsApp`)
      await pushAgentMessage(
        locationId,
        employeeId,
        `✅ Confirmed — you're covering the *${shift.shiftTemplate.name}* shift on ${formatShiftDate(start)} (${shift.shiftTemplate.startTime}–${shift.shiftTemplate.endTime}). Thanks for stepping in! ☕`
      )
      if (previous && previous.id !== employeeId) {
        await pushAgentMessage(
          locationId,
          previous.id,
          `Heads up: your *${shift.shiftTemplate.name}* shift on ${formatShiftDate(start)} has been reassigned to a colleague.`
        )
      }
      const me = await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } })
      const weekOffset = Math.round((weekStart.getTime() - currentMonday().getTime()) / (7 * 86400000))
      await pushOwnerMessage(
        locationId,
        `✅ *${me?.name ?? "They"}* accepted — now covering the ${shift.shiftTemplate.name} shift on ${formatShiftDate(start)}${
          previous ? ` (was ${previous.name})` : ""
        }.\n⟦grid:${weekOffset}⟧`
      )
      return
    }

    case "AVAIL_OK": {
      const weekStart = new Date(Number(arg))
      await confirmAvailability(employeeId, weekStart)
      await pushAgentMessage(locationId, employeeId, `Great, I'll schedule you as usual. Thanks! 🙌`)
      await maybeFireGenerate(locationId, weekStart)
      return
    }

    case "AVAIL_NO": {
      const [templateId, dayStr, msStr] = arg.split(":")
      const weekStart = new Date(Number(msStr))
      const day = parseInt(dayStr)
      await markUnavailable(employeeId, templateId, day, weekStart)
      const tmpl = await prisma.shiftTemplate.findUnique({ where: { id: templateId }, select: { name: true } })
      await pushAgentMessage(
        locationId,
        employeeId,
        `Noted — I'll leave you off the *${tmpl?.name ?? "that"}* shift next week. Mark more if you like, and tap "All good" when you're done.`,
        [{ label: "✅ All good", command: `AVAIL_OK:${msStr}` }]
      )
      return
    }

    default:
      await pushAgentMessage(locationId, employeeId, "I didn't catch that — text *help* for the options.")
  }
}

// ── Small helpers ────────────────────────────────────────────────────────────

async function getOwnShift(shiftId: string, employeeId: string) {
  const shift = (await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { shiftTemplate: true, schedule: { select: { weekStart: true, locationId: true } } },
  })) as unknown as ShiftWithCtx | null
  if (!shift || shift.employeeId !== employeeId) return null
  return shift
}

async function notYours(locationId: string, employeeId: string) {
  await pushAgentMessage(locationId, employeeId, "That shift isn't yours (anymore).")
}

async function alreadyHandled(locationId: string, employeeId: string, status: string) {
  const map: Record<string, string> = {
    ACCEPTED: "You already accepted that one. ✅",
    DECLINED: "You already declined that one.",
    REASSIGNED: "That one's already been covered by someone else.",
    UNASSIGNED: "That one isn't assigned to you right now.",
  }
  await pushAgentMessage(locationId, employeeId, map[status] ?? "That's no longer possible.")
}

async function audit(locationId: string, action: string, outcome: string) {
  await prisma.auditLog.create({
    data: { locationId, action, aiReasoning: "", candidatesConsidered: [], outcome },
  })
}

// ── Weekly availability collection ───────────────────────────────────────────

// The real date of a slot: weekStart is a Monday, dayOfWeek is 0=Sun..6=Sat.
// Offset so the resulting date's getDay() equals dayOfWeek (matches how
// getEffectiveAvailability maps overrides back by date.getDay()).
function unavailabilityDate(weekStart: Date, dayOfWeek: number): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + ((dayOfWeek - 1 + 7) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

// Is a weekly "what can't you work?" ask still open for this employee? Returns
// the target weekStart if the newest ask hasn't been answered (no confirmation
// yet), else null — so free text only counts as an answer while one is pending.
async function pendingAvailabilityWeek(employeeId: string): Promise<Date | null> {
  const recent = await prisma.chatMessage.findMany({
    where: { employeeId, role: "AGENT" },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { actions: true },
  })
  for (const m of recent) {
    const acts = (m.actions as ChatAction[] | null) ?? []
    const ok = acts.find((a) => a.command?.startsWith("AVAIL_OK:"))
    if (!ok) continue
    const weekStart = new Date(Number(ok.command.split(":")[1]))
    const already = await prisma.availabilityConfirmation.findUnique({
      where: { employeeId_weekStart: { employeeId, weekStart } },
    })
    return already ? null : weekStart
  }
  return null
}

// "I'm done — nothing (else) changed." Marks the employee as having responded.
async function confirmAvailability(employeeId: string, weekStart: Date) {
  await prisma.availabilityConfirmation.upsert({
    where: { employeeId_weekStart: { employeeId, weekStart } },
    update: {},
    create: { employeeId, weekStart },
  })
}

// One slot off next week — an override the generator honours. Incremental: does
// NOT confirm on its own, so they can mark several then tap "All good".
async function markUnavailable(employeeId: string, shiftTemplateId: string, dayOfWeek: number, weekStart: Date) {
  const date = unavailabilityDate(weekStart, dayOfWeek)
  await prisma.availabilityOverride.upsert({
    where: { employeeId_shiftTemplateId_date: { employeeId, shiftTemplateId, date } },
    update: { available: false },
    create: { employeeId, shiftTemplateId, date, available: false },
  })
}

// Once every gated (category-A) employee has confirmed, build the draft now —
// fire generation directly rather than depending on a background wait staying
// alive. Guarded so we never generate twice for the same week (the last
// confirmer is the only reply that sees the gate satisfied, but a draft may
// already exist from an earlier run).
async function maybeFireGenerate(locationId: string, weekStart: Date) {
  const employees = await prisma.employee.findMany({
    where: { locationId },
    select: { id: true, category: true },
  })
  const gated = employees.filter((e) => needsAvailability(e.category)).map((e) => e.id)
  // Note: no early return when gated is empty — a team with no category-A staff
  // has nothing to wait on, so the first "All good" should build the draft.
  const confirmed = await prisma.availabilityConfirmation.findMany({
    where: { weekStart, employeeId: { in: gated } },
    select: { employeeId: true },
  })
  const confirmedIds = new Set(confirmed.map((c) => c.employeeId))
  if (!gated.every((id) => confirmedIds.has(id))) return

  const existing = await prisma.schedule.count({ where: { locationId, weekStart } })
  if (existing > 0) return
  await safeSend({ name: "schedule/manual-generate", data: { locationId } })
}

// Free-text answer to the ask, e.g. "Mittwoch Abend geht nicht". The LLM maps
// it onto the employee's known slots; we write the overrides and confirm (a
// typed sentence is a complete answer). Falls back to a nudge if unparseable.
async function handleAvailabilityText(locationId: string, employeeId: string, text: string, weekStart: Date) {
  const slots = await prisma.recurringAvailability.findMany({
    where: { employeeId },
    include: { shiftTemplate: { select: { name: true, startTime: true, endTime: true } } },
  })
  const off = await parseUnavailabilityWithLLM(text, slots)

  if (off.length === 0) {
    await pushAgentMessage(
      locationId,
      employeeId,
      `I didn't quite catch which shift you mean. Tap "📋 My shifts" or one of the shift buttons above — or "✅ All good" if nothing changes.`,
      [{ label: "✅ All good", command: `AVAIL_OK:${weekStart.getTime()}` }]
    )
    return
  }

  const names: string[] = []
  for (const s of off) {
    await markUnavailable(employeeId, s.shiftTemplateId, s.dayOfWeek, weekStart)
    names.push(s.label)
  }
  await confirmAvailability(employeeId, weekStart)
  await pushAgentMessage(
    locationId,
    employeeId,
    `Noted — off next week: ${names.join(", ")}. Thanks, I'll schedule everything else as usual! 🙌`
  )
  await maybeFireGenerate(locationId, weekStart)
}

type RecurringSlot = {
  shiftTemplateId: string
  dayOfWeek: number
  shiftTemplate: { name: string; startTime: string; endTime: string }
}

async function parseUnavailabilityWithLLM(
  text: string,
  slots: RecurringSlot[]
): Promise<{ shiftTemplateId: string; dayOfWeek: number; label: string }[]> {
  if (slots.length === 0) return []
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const catalog = slots.map((s, i) => ({
    index: i,
    day: dayNames[s.dayOfWeek],
    shift: s.shiftTemplate.name,
    time: `${s.shiftTemplate.startTime}-${s.shiftTemplate.endTime}`,
  }))
  try {
    const { ChatOpenAI } = await import("@langchain/openai")
    const { z } = await import("zod")
    const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0 })
    const out = await model
      .withStructuredOutput(z.object({ unavailableIndexes: z.array(z.number().int()) }))
      .invoke(
        `A café employee (German or English) is telling their scheduler which of their usual shifts they CANNOT work next week. Return the indexes of the slots they can't work. If none clearly match, return an empty array.\n\nTheir usual slots:\n${JSON.stringify(catalog)}\n\nMessage: "${text}"`
      )
    const seen = new Set<number>()
    const result: { shiftTemplateId: string; dayOfWeek: number; label: string }[] = []
    for (const i of out.unavailableIndexes) {
      if (i < 0 || i >= slots.length || seen.has(i)) continue
      seen.add(i)
      const s = slots[i]
      result.push({
        shiftTemplateId: s.shiftTemplateId,
        dayOfWeek: s.dayOfWeek,
        label: `${dayNames[s.dayOfWeek]} ${s.shiftTemplate.name}`,
      })
    }
    return result
  } catch {
    return []
  }
}

// ── LLM fallback ─────────────────────────────────────────────────────────────

async function classifyWithLLM(text: string): Promise<import("./agent").Intent> {
  try {
    const { ChatOpenAI } = await import("@langchain/openai")
    const { z } = await import("zod")
    const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0 })
    const out = await model
      .withStructuredOutput(
        z.object({ intent: z.enum(["MY_SHIFTS", "OPEN_SHIFTS", "SICK", "HELP"]) })
      )
      .invoke(
        `A café employee texted their scheduling assistant (German or English). Map it to one intent: MY_SHIFTS (wants to see their schedule), OPEN_SHIFTS (wants extra/available shifts), SICK (calling in sick / can't make a shift), HELP (greeting or unclear).\n\nMessage: "${text}"`
      )
    return { kind: out.intent } as import("./agent").Intent
  } catch {
    return { kind: "HELP" }
  }
}

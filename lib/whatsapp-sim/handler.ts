// The simulator's backend brain. Turns an employee's message into real,
// guarded actions on the real schedule (same status guards and Inngest events
// as the email/token path) and an agent reply. Also exposes pushAgentMessage,
// which proactive sources (schedule approval, replacement outreach) use to DM
// an employee's thread.

import { prisma } from "@/prisma/client"
import { inngest } from "@/lib/inngest/client"
import { getShiftStart, getShiftEnd, formatShiftDate } from "@/lib/scheduling/shift-date"
import { checkEmployeeAssignment } from "@/lib/compliance/check"
import { loadRules } from "@/lib/compliance/load"
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
}

async function pushEmployeeMessage(locationId: string, employeeId: string, body: string) {
  await prisma.chatMessage.create({
    data: { locationId, employeeId, role: "EMPLOYEE", body },
  })
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function handleEmployeeMessage(employeeId: string, text: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
  if (!employee) return

  await pushEmployeeMessage(employee.locationId, employeeId, text)

  let intent = routeMessage(text)

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
  return (await prisma.shift.findMany({
    where: {
      employeeId,
      status: { in: statuses as never },
      schedule: { weekStart: { gte: currentMonday() } },
    },
    include: { shiftTemplate: true, schedule: { select: { weekStart: true, locationId: true } } },
    orderBy: [{ schedule: { weekStart: "asc" } }, { dayOfWeek: "asc" }],
  })) as unknown as ShiftWithCtx[]
}

async function replyMyShifts(locationId: string, employeeId: string) {
  const shifts = await loadEmployeeShifts(employeeId, ["PENDING", "ACCEPTED", "REASSIGNED"])
  if (shifts.length === 0) {
    await pushAgentMessage(locationId, employeeId, "Du hast aktuell keine Schichten eingeplant. 🌿")
    return
  }
  const pending = shifts.filter((s) => s.status === "PENDING")
  const lines = shifts.map((s) => {
    const mark = s.status === "PENDING" ? "🕓 offen" : s.status === "REASSIGNED" ? "🔁 übernommen" : "✅ bestätigt"
    return `${shiftLine(s)} — ${mark}`
  })
  await pushAgentMessage(
    locationId,
    employeeId,
    `Deine Schichten:\n\n${lines.join("\n")}`
  )
  // One follow-up per pending shift with tappable accept/decline.
  for (const s of pending) {
    await pushAgentMessage(locationId, employeeId, `${shiftLine(s)} — zusagen?`, [
      { label: "✅ Zusagen", command: `ACCEPT:${s.id}` },
      { label: "❌ Absagen", command: `DECLINE:${s.id}` },
    ])
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
    await pushAgentMessage(locationId, employeeId, "Gerade sind keine freien Schichten für dich verfügbar. Ich melde mich, sobald etwas frei wird! 👍")
    return
  }
  await pushAgentMessage(locationId, employeeId, "Diese Schichten sind noch frei — tippe zum Übernehmen:")
  for (const s of eligible) {
    await pushAgentMessage(locationId, employeeId, shiftLine(s), [
      { label: "🙋 Übernehmen", command: `TAKE:${s.id}` },
    ])
  }
}

async function replySickPicker(locationId: string, employeeId: string) {
  const shifts = await loadEmployeeShifts(employeeId, ["PENDING", "ACCEPTED"])
  if (shifts.length === 0) {
    await pushAgentMessage(locationId, employeeId, "Du hast keine anstehenden Schichten zum Absagen. Gute Besserung trotzdem! 🍵")
    return
  }
  await pushAgentMessage(locationId, employeeId, "Für welche Schicht meldest du dich krank?")
  for (const s of shifts) {
    await pushAgentMessage(locationId, employeeId, shiftLine(s), [
      { label: "🤒 Krankmelden", command: `SICK:${s.id}` },
    ])
  }
}

async function replyHelp(locationId: string, employeeId: string, name: string) {
  await pushAgentMessage(
    locationId,
    employeeId,
    `Hallo ${name.split(" ")[0]}! 👋 Ich bin dein ShiftPilot-Assistent. Ich kann:\n\n• *"meine Schichten"* — deinen Plan zeigen\n• *"frei"* — freie Schichten zum Übernehmen\n• *"krank"* — dich krankmelden\n\nSchreib einfach, was du brauchst.`,
    [
      { label: "📋 Meine Schichten", command: "MENU:MY_SHIFTS" },
      { label: "🙋 Freie Schichten", command: "MENU:OPEN_SHIFTS" },
      { label: "🤒 Krankmelden", command: "MENU:SICK" },
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
      await pushAgentMessage(locationId, employeeId, `✅ Bestätigt! ${shiftLine(shift)}. Bis dann! ☕`)
      return
    }

    case "DECLINE": {
      const shift = await getOwnShift(arg, employeeId)
      if (!shift) return notYours(locationId, employeeId)
      if (shift.status !== "PENDING") return alreadyHandled(locationId, employeeId, shift.status)
      await prisma.shift.update({ where: { id: arg }, data: { status: "DECLINED" } })
      await safeSend({ name: "shift/declined", data: { shiftId: arg } })
      await audit(locationId, "SHIFT_DECLINED", `Shift ${arg} declined via WhatsApp — replacement triggered`)
      await pushAgentMessage(locationId, employeeId, `Alles klar, ich hab die Schicht abgesagt und suche direkt Ersatz. 🔎`)
      return
    }

    case "SICK": {
      const shift = await getOwnShift(arg, employeeId)
      if (!shift) return notYours(locationId, employeeId)
      if (shift.status === "LENT_OUT") return notYours(locationId, employeeId)
      await prisma.shift.update({ where: { id: arg }, data: { status: "DECLINED" } })
      await safeSend({ name: "shift/sick-call", data: { shiftId: arg } })
      const sickCall = await prisma.sickCall.create({
        data: { locationId, shiftId: arg, employeeId },
      })
      await safeSend({ name: "sick/reported", data: { sickCallId: sickCall.id } })
      await pushAgentMessage(
        locationId,
        employeeId,
        `Gute Besserung! 🤒 Ich hab deiner Managerin Bescheid gegeben und suche schon nach Ersatz. Bitte informier sie auch kurz persönlich.`
      )
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
          `Das geht leider nicht — ${violation.detail}. (Arbeitszeitgesetz)`
        )
        return
      }

      const { count } = await prisma.shift.updateMany({
        where: { id: arg, status: "UNASSIGNED" },
        data: { employeeId, status: "ACCEPTED" },
      })
      if (count === 0) return alreadyHandled(locationId, employeeId, "ACCEPTED")
      await audit(locationId, "SHIFT_ACCEPTED", `Open shift ${arg} taken via WhatsApp`)
      await pushAgentMessage(locationId, employeeId, `🙌 Super, die Schicht gehört dir: ${shiftLine(shift)}. Danke fürs Einspringen!`)
      return
    }

    case "COVER": {
      // Yes to a cover request — resolve the replacement engine's wait.
      await safeSend({ name: "swap/response", data: { shiftId: arg, response: "ACCEPT_SWAP" } })
      await pushAgentMessage(locationId, employeeId, `🙌 Danke! Ich bestätige die Übernahme gleich.`)
      return
    }

    case "NOCOVER":
      await pushAgentMessage(locationId, employeeId, `Kein Problem, danke für die Rückmeldung. 👍`)
      return

    default:
      await pushAgentMessage(locationId, employeeId, "Das hab ich nicht verstanden — schreib *Hilfe* für die Optionen.")
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
  await pushAgentMessage(locationId, employeeId, "Diese Schicht gehört nicht (mehr) zu dir.")
}

async function alreadyHandled(locationId: string, employeeId: string, status: string) {
  const map: Record<string, string> = {
    ACCEPTED: "Die hast du schon zugesagt. ✅",
    DECLINED: "Die hast du schon abgesagt.",
    REASSIGNED: "Die wurde schon anderweitig vergeben.",
    UNASSIGNED: "Die ist gerade nicht dir zugewiesen.",
  }
  await pushAgentMessage(locationId, employeeId, map[status] ?? "Das ist nicht mehr möglich.")
}

async function audit(locationId: string, action: string, outcome: string) {
  await prisma.auditLog.create({
    data: { locationId, action, aiReasoning: "", candidatesConsidered: [], outcome },
  })
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

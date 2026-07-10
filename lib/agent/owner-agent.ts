// The copilot's front door for owner messages. Deterministic first (tapped
// confirm/cancel/undo buttons never depend on the LLM — same stance as the
// employee simulator); free-form text goes through a gpt-4o tool-calling loop
// where read results feed back into the model and the FIRST write outcome is
// pushed verbatim and ends the turn.

import { prisma } from "@/prisma/client"
import { TOOLS } from "./tools"
import { dispatchToolCall, confirmPending, declinePending, undoLast } from "./dispatcher"
import { pushOwnerMessage, recordOwnerMessage, ownerThreadLanguage } from "./owner-thread"
import { currentMonday } from "./resolve"
import { detectLanguage, DAY_LABELS, t } from "./i18n"
import type { AgentContext, ToolOutcome } from "./types"

const COMMAND_RE = /^([A-Z_]+):(.*)$/
const UNDO_WORDS = ["undo", "rückgängig", "rueckgaengig", "zurücknehmen"]

export async function handleOwnerMessage(
  userId: string,
  locationId: string,
  text: string,
  pageContext?: string
) {
  const trimmed = text.trim()
  if (!trimmed) return

  // Language of THIS message; button taps and unclassifiable text fall back
  // to the thread's language, then English. Resolved before persisting so the
  // current message doesn't shadow the lookup.
  const lang = detectLanguage(trimmed) ?? (await ownerThreadLanguage(locationId, userId))

  await recordOwnerMessage(locationId, userId, trimmed)

  const ctx: AgentContext = { userId, locationId, sourceText: trimmed, lang }

  // Deterministic command routing — buttons and the undo keyword.
  const cmd = trimmed.match(COMMAND_RE)
  if (cmd) {
    const [, command, arg] = cmd
    let outcome: ToolOutcome | null = null
    if (command === "CONFIRM") outcome = await confirmPending(ctx, arg)
    else if (command === "CANCEL") outcome = await declinePending(ctx, arg)
    else if (command === "UNDO") outcome = await undoLast(ctx)
    if (outcome) {
      await pushReply(locationId, outcome)
      return
    }
  }
  if (UNDO_WORDS.some((w) => trimmed.toLowerCase() === w || trimmed.toLowerCase() === `${w} das`)) {
    await pushReply(locationId, await undoLast(ctx))
    return
  }

  try {
    await runLlmTurn(ctx, trimmed, pageContext)
  } catch (err) {
    console.error("copilot LLM turn failed:", err)
    await pushOwnerMessage(locationId, t(ctx.lang).llmDown)
  }
}

async function pushReply(locationId: string, outcome: ToolOutcome) {
  if (outcome.kind === "data") {
    await pushOwnerMessage(locationId, outcome.data)
    return
  }
  await pushOwnerMessage(locationId, outcome.reply.body, outcome.reply.actions)
}

// ── LLM loop ─────────────────────────────────────────────────────────────────

async function runLlmTurn(ctx: AgentContext, text: string, pageContext?: string) {
  const { ChatOpenAI } = await import("@langchain/openai")
  const { SystemMessage, HumanMessage, AIMessage, ToolMessage } = await import(
    "@langchain/core/messages"
  )
  type BaseMessage = InstanceType<typeof SystemMessage | typeof HumanMessage | typeof AIMessage | typeof ToolMessage>

  const [location, employees, templates, history] = await Promise.all([
    prisma.location.findUnique({ where: { id: ctx.locationId }, select: { name: true } }),
    prisma.employee.findMany({
      where: { locationId: ctx.locationId },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    prisma.shiftTemplate.findMany({
      where: { locationId: ctx.locationId },
      select: { name: true, startTime: true, endTime: true },
    }),
    prisma.chatMessage.findMany({
      where: { userId: ctx.userId, locationId: ctx.locationId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { role: true, body: true },
    }),
  ])

  const monday = currentMonday()
  const system = new SystemMessage(
    `You are the Covrly Copilot — the scheduling assistant for the owner of "${location?.name ?? "this venue"}".
You operate the scheduling system for them via tools. Never invent facts: look everything up with the read tools; make every change with a write tool. One write tool call at a time.
Today is ${new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}; the current week starts Monday ${monday.toLocaleDateString("de-DE")}. dayOfWeek convention: 0=Sunday, 1=Monday … 6=Saturday. weekOffset: 0=current week, 1=next week.
Roster: ${employees.map((e) => e.name).join(", ") || "(empty)"}.
Shift templates: ${templates.map((t) => `${t.name} ${t.startTime}–${t.endTime}`).join(", ") || "(none)"}.
Day labels: ${DAY_LABELS.en.join(", ")} / German ${DAY_LABELS.de.join(", ")}.
${pageContext ? `The owner is currently looking at: ${pageContext}.` : ""}
The owner's current language is ${ctx.lang === "de" ? "German" : "English"} — reply in it. Match their language if they switch (English and German are supported; when unclear, use English). Tool results arrive in English — translate the facts into the owner's language. Reply briefly and warmly — WhatsApp style, no markdown headers. Use *bold* sparingly. If a name or reference is ambiguous, ask instead of guessing.

How approvals work — important: when a change needs the owner's confirmation (publishing, deleting someone, edits to an already-published week), the system posts the proposal RIGHT HERE in the chat with ✅/❌ buttons the moment you call the write tool. So to do such a thing, CALL THE TOOL. Never refuse because "approval is required", never describe an approval process, never offer to "guide them through it" — the buttons ARE the approval.

What you cannot do — be honest about it: a PENDING ("offen") shift is waiting for the EMPLOYEE's own yes; nobody can confirm it for them, so say exactly that and offer what helps (reassign it, or leave it). There are no bulk edits — several changes happen one at a time, so pick the first and tell the owner you'll take them one by one. If no tool fits a request at all, say plainly that you can't do it yet and name the closest thing you can.`
  )

  const past: BaseMessage[] = history
    .reverse()
    .slice(0, -1) // the current message was already persisted; don't duplicate it
    .map((m) => (m.role === "OWNER" ? new HumanMessage(m.body) : new AIMessage(m.body)))

  const llmTools = Object.entries(TOOLS)
    .filter(([, def]) => !("internal" in def && def.internal))
    .map(([name, def]) => ({ name, description: def.description, schema: def.schema }))

  const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0 }).bindTools(llmTools)

  const messages: BaseMessage[] = [system, ...past, new HumanMessage(text)]

  for (let turn = 0; turn < 5; turn++) {
    const response = await model.invoke(messages)
    const toolCalls = response.tool_calls ?? []

    if (toolCalls.length === 0) {
      const content =
        typeof response.content === "string" ? response.content.trim() : ""
      await pushOwnerMessage(ctx.locationId, content || t(ctx.lang).howCanIHelp)
      return
    }

    messages.push(response)
    for (const call of toolCalls) {
      const outcome = await dispatchToolCall(ctx, call.name, call.args)
      if (outcome.kind === "data") {
        messages.push(new ToolMessage({ content: outcome.data, tool_call_id: call.id ?? "" }))
        continue
      }
      // A write happened (or was proposed/refused): its reply carries the
      // buttons and the truth — push it verbatim and end the turn.
      await pushReply(ctx.locationId, outcome)
      return
    }
  }

  await pushOwnerMessage(ctx.locationId, t(ctx.lang).lost)
}

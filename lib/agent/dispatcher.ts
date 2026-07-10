// The copilot's single door. Every tool call the LLM proposes lands here:
// params are zod-validated, writes are classified instant vs confirm-first,
// pending proposals are re-validated at confirm time (state may have moved),
// every executed mutation gets an AuditLog row carrying the owner's original
// sentence, and reversible ones record their inverse for "undo".

import { prisma } from "@/prisma/client"
import { TOOLS, type WriteTool, type PrepareResult } from "./tools"
import { needsConfirmation } from "./classify"
import type { AgentContext, ToolOutcome, AgentReply } from "./types"

const confirmButtons = (actionId: string): AgentReply["actions"] => [
  { label: "✅ Ja, machen", command: `CONFIRM:${actionId}` },
  { label: "❌ Abbrechen", command: `CANCEL:${actionId}` },
]

async function proposePending(
  ctx: AgentContext,
  tool: string,
  preview: string,
  execParams: Record<string, unknown>
): Promise<ToolOutcome> {
  const action = await prisma.agentAction.create({
    data: {
      locationId: ctx.locationId,
      userId: ctx.userId,
      tool,
      params: execParams as object,
      preview,
      sourceText: ctx.sourceText,
      status: "PENDING",
    },
  })
  return {
    kind: "pending",
    reply: { body: `${preview}\n\nSoll ich?`, actions: confirmButtons(action.id) },
  }
}

async function executeWrite(
  ctx: AgentContext,
  toolName: string,
  def: WriteTool,
  execParams: Record<string, unknown>,
  preview: string,
  pendingId?: string
): Promise<ToolOutcome> {
  const result = await def.execute(ctx, execParams)

  if ("error" in result) {
    if (pendingId) {
      await prisma.agentAction.update({ where: { id: pendingId }, data: { status: "DECLINED" } })
    }
    return { kind: "error", reply: { body: result.error } }
  }

  // Soft conflict discovered mid-execution → turn it into a proposal.
  if ("confirmFirst" in result) {
    if (pendingId) {
      // Re-proposing from a pending row: keep the row, upgrade its params/preview.
      const updated = await prisma.agentAction.update({
        where: { id: pendingId },
        data: {
          params: result.confirmFirst.execParams as object,
          preview: result.confirmFirst.preview,
        },
      })
      return {
        kind: "pending",
        reply: { body: `${result.confirmFirst.preview}`, actions: confirmButtons(updated.id) },
      }
    }
    return proposePending(ctx, toolName, result.confirmFirst.preview, result.confirmFirst.execParams)
  }

  const inverse = result.inverse
  if (pendingId) {
    await prisma.agentAction.update({
      where: { id: pendingId },
      data: { status: "EXECUTED", inverse: inverse ? (inverse as unknown as object) : undefined },
    })
  } else {
    await prisma.agentAction.create({
      data: {
        locationId: ctx.locationId,
        userId: ctx.userId,
        tool: toolName,
        params: execParams as object,
        preview,
        sourceText: ctx.sourceText,
        status: "EXECUTED",
        inverse: inverse ? (inverse as unknown as object) : undefined,
      },
    })
  }

  await prisma.auditLog.create({
    data: {
      locationId: ctx.locationId,
      action: "AGENT_ACTION",
      aiReasoning: ctx.sourceText,
      candidatesConsidered: [{ tool: toolName }],
      outcome: preview,
    },
  })

  return { kind: "done", reply: { body: result.reply } }
}

export async function dispatchToolCall(
  ctx: AgentContext,
  toolName: string,
  rawParams: unknown
): Promise<ToolOutcome> {
  const def = TOOLS[toolName]
  if (!def || ("internal" in def && def.internal)) {
    return { kind: "error", reply: { body: `Das Werkzeug „${toolName}“ kenne ich nicht.` } }
  }

  const parsed = def.schema.safeParse(rawParams ?? {})
  if (!parsed.success) {
    return {
      kind: "error",
      reply: { body: `Da fehlen mir Angaben: ${parsed.error.issues.map((i) => i.message).join("; ")}` },
    }
  }

  if (def.kind === "read") {
    const data = await def.run(ctx, parsed.data as never)
    return { kind: "data", data }
  }

  const prepared = await def.prepare(ctx, parsed.data as never)
  if ("error" in prepared) return { kind: "error", reply: { body: prepared.error } }

  const { preview, execParams, target }: PrepareResult = prepared
  if (needsConfirmation(toolName, target)) {
    return proposePending(ctx, toolName, preview, execParams)
  }
  return executeWrite(ctx, toolName, def, execParams, preview)
}

// Confirm button tapped: re-validate nothing here — the tool's execute()
// re-checks guards against CURRENT state, which is the honest re-validation.
export async function confirmPending(ctx: AgentContext, actionId: string): Promise<ToolOutcome> {
  const action = await prisma.agentAction.findFirst({
    where: { id: actionId, userId: ctx.userId, status: "PENDING" },
  })
  if (!action) {
    return { kind: "error", reply: { body: "Da ist nichts (mehr) offen zum Bestätigen." } }
  }
  const def = TOOLS[action.tool]
  if (!def || def.kind !== "write") {
    return { kind: "error", reply: { body: "Diese Aktion kann ich nicht mehr ausführen." } }
  }
  const execCtx: AgentContext = { ...ctx, sourceText: action.sourceText }
  return executeWrite(
    execCtx,
    action.tool,
    def,
    action.params as Record<string, unknown>,
    action.preview,
    action.id
  )
}

export async function declinePending(ctx: AgentContext, actionId: string): Promise<ToolOutcome> {
  const { count } = await prisma.agentAction.updateMany({
    where: { id: actionId, userId: ctx.userId, status: "PENDING" },
    data: { status: "DECLINED" },
  })
  if (count === 0) {
    return { kind: "error", reply: { body: "Da war nichts (mehr) offen." } }
  }
  return { kind: "done", reply: { body: "Okay, verworfen — nichts wurde geändert. 👍" } }
}

// "Undo": the latest executed, reversible action runs its recorded inverse
// through the same execute path (guards re-check legality at undo time).
export async function undoLast(ctx: AgentContext): Promise<ToolOutcome> {
  const recent = await prisma.agentAction.findMany({
    where: { userId: ctx.userId, locationId: ctx.locationId, status: "EXECUTED" },
    orderBy: { createdAt: "desc" },
    take: 10,
  })
  const target = recent.find((a) => a.inverse != null)
  if (!target) {
    return { kind: "error", reply: { body: "Ich finde nichts, das ich rückgängig machen könnte." } }
  }
  const inverse = target.inverse as unknown as { tool: string; params: Record<string, unknown>; preview: string }
  const def = TOOLS[inverse.tool]
  if (!def || def.kind !== "write") {
    return { kind: "error", reply: { body: "Diese Aktion lässt sich nicht rückgängig machen." } }
  }

  const outcome = await executeWrite(
    { ...ctx, sourceText: `undo: ${target.sourceText}` },
    inverse.tool,
    def,
    inverse.params,
    `↩️ Rückgängig: ${target.preview}`
  )
  if (outcome.kind === "done") {
    await prisma.agentAction.update({ where: { id: target.id }, data: { status: "UNDONE" } })
    return {
      kind: "done",
      reply: { body: `↩️ Rückgängig gemacht („${target.preview}“).\n${outcome.reply.body}` },
    }
  }
  return outcome
}

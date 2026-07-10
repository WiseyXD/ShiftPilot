// Smoke test for the Covrly Copilot (#43) against the real dev DB + LLM.
// Run: bun scripts/agent-smoke.ts   (needs OPENAI_API_KEY; mutates nothing —
// the only write is a pending publish proposal that gets declined again)

import { prisma } from "../prisma/client"
import { handleOwnerMessage } from "../lib/agent/owner-agent"
import { dispatchToolCall, declinePending } from "../lib/agent/dispatcher"

async function main() {
  const julia = await prisma.user.findUnique({
    where: { email: "julia@shiftt.com" },
    include: { locations: true },
  })
  if (!julia || julia.locations.length === 0) {
    throw new Error("demo owner missing — run bun scripts/demo-minou.ts first")
  }
  const loc = julia.locations[0]
  console.log(`owner: ${julia.email} · location: ${loc.name}`)

  await prisma.chatMessage.deleteMany({ where: { userId: julia.id, locationId: loc.id } })

  console.log("\n— Q&A through the LLM loop —")
  await handleOwnerMessage(julia.id, loc.id, "Wer arbeitet diese Woche?")

  console.log("— deterministic undo (should refuse politely) —")
  await handleOwnerMessage(julia.id, loc.id, "undo")

  const thread = await prisma.chatMessage.findMany({
    where: { userId: julia.id, locationId: loc.id },
    orderBy: { createdAt: "asc" },
  })
  for (const m of thread) {
    console.log(`\n[${m.role}] ${m.body}${m.actions ? `\n   buttons: ${JSON.stringify(m.actions)}` : ""}`)
  }

  console.log("\n— confirm-first proposal on the real AgentAction table —")
  const ctx = { userId: julia.id, locationId: loc.id, sourceText: "smoke: publish" }
  let proposal = await dispatchToolCall(ctx, "publish_schedule", {})
  console.log("publish proposal:", JSON.stringify(proposal, null, 2))
  if (proposal.kind !== "pending") {
    // No draft around — a delete proposal exercises the same pending lifecycle.
    proposal = await dispatchToolCall(
      { ...ctx, sourceText: "smoke: delete employee" },
      "delete_employee",
      { employeeName: "Nina" }
    )
    console.log("delete proposal:", JSON.stringify(proposal, null, 2))
  }
  if (proposal.kind === "pending") {
    const id = proposal.reply.actions![0].command.split(":")[1]
    console.log("decline:", JSON.stringify(await declinePending(ctx, id)))
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

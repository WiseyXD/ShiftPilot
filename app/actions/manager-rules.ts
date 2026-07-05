"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"
import { resolveNames } from "@/lib/scheduling/manager-rules"
import { revalidatePath } from "next/cache"

export interface RuleDraft {
  kind: "NEVER_TOGETHER" | "PREFER_DAY" | "AVOID_DAY" | "MAX_SHIFTS_PER_WEEK"
  employeeIds: string[]
  employeeNames: string[]
  dayOfWeek: number | null
  maxPerWeek: number | null
  plain: string
  sourceText: string
}

export type RuleParseState = { error: string } | { draft: RuleDraft } | null

const draftSchema = z.object({
  kind: z.enum(["NEVER_TOGETHER", "PREFER_DAY", "AVOID_DAY", "MAX_SHIFTS_PER_WEEK"]),
  employeeNames: z.array(z.string()).min(1),
  dayOfWeek: z.number().int().min(0).max(6).nullable(),
  maxPerWeek: z.number().int().min(1).nullable(),
  plain: z.string(),
  confident: z.boolean(),
})

// The LLM only translates; ambiguity is rejected with a clarification ask,
// never guessed (concept doc §1a).
export async function parseManagerRule(
  _prev: RuleParseState,
  formData: FormData
): Promise<RuleParseState> {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }

  const locationId = formData.get("locationId") as string
  const location = await prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
    include: { employees: { select: { id: true, name: true } } },
  })
  if (!location) return { error: "Location not found" }

  const text = ((formData.get("text") as string) ?? "").trim()
  if (!text) return { error: "Type a rule first" }

  let parsed: z.infer<typeof draftSchema>
  try {
    const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0 })
    parsed = await model.withStructuredOutput(draftSchema).invoke(`
Translate this scheduling rule (may be German or English) into ONE structured constraint.
Kinds: NEVER_TOGETHER (two+ people never on overlapping shifts), PREFER_DAY / AVOID_DAY
(person prefers/avoids a weekday; dayOfWeek 0=Sunday…6=Saturday), MAX_SHIFTS_PER_WEEK.
Employees at this venue: ${location.employees.map((e) => e.name).join(", ")}.
Set confident=false if the text doesn't clearly map to exactly one kind.
Write "plain" as a short English rendering of your interpretation.

Rule: "${text}"
`)
  } catch {
    return { error: "Couldn't parse that right now — try again" }
  }

  if (!parsed.confident) {
    return { error: `Couldn't map that to a rule — try e.g. "Anna and Ben never together" or "Ben prefers Saturdays"` }
  }

  const resolved = resolveNames(parsed.employeeNames, location.employees)
  if (!resolved.ok) return { error: `${resolved.error} — use the exact name from your roster` }

  if (parsed.kind === "NEVER_TOGETHER" && resolved.ids.length < 2) {
    return { error: "Never-together needs at least two people" }
  }
  if ((parsed.kind === "PREFER_DAY" || parsed.kind === "AVOID_DAY") && parsed.dayOfWeek === null) {
    return { error: "Which weekday? Couldn't tell from the text" }
  }
  if (parsed.kind === "MAX_SHIFTS_PER_WEEK" && parsed.maxPerWeek === null) {
    return { error: "How many shifts per week? Couldn't tell from the text" }
  }

  return {
    draft: {
      kind: parsed.kind,
      employeeIds: resolved.ids,
      employeeNames: parsed.employeeNames,
      dayOfWeek: parsed.dayOfWeek,
      maxPerWeek: parsed.maxPerWeek,
      plain: parsed.plain,
      sourceText: text,
    },
  }
}

export async function saveManagerRule(locationId: string, draft: RuleDraft) {
  const session = await auth()
  if (!session) return
  const location = await prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
  })
  if (!location) return

  await prisma.managerRule.create({
    data: {
      locationId,
      kind: draft.kind,
      params: {
        employeeIds: draft.employeeIds,
        dayOfWeek: draft.dayOfWeek,
        maxPerWeek: draft.maxPerWeek,
      },
      sourceText: draft.sourceText,
      plain: draft.plain,
    },
  })
  revalidatePath(`/dashboard/${locationId}`)
}

export async function deleteManagerRule(id: string) {
  const session = await auth()
  if (!session) return
  const rule = await prisma.managerRule.findFirst({
    where: { id, location: { ownerId: session.user.id } },
  })
  if (!rule) return
  await prisma.managerRule.delete({ where: { id } })
  revalidatePath(`/dashboard/${rule.locationId}`)
}

// Shared shapes for the Covrly Copilot — the manager-facing agent (#43).
// Doctrine: the LLM only proposes tool calls; the dispatcher validates,
// classifies (instant vs confirm-first) and executes them through the same
// guarded doors as the dashboard/token/simulator paths.

import type { Lang } from "./i18n"

export interface AgentContext {
  userId: string
  locationId: string
  sourceText: string // what the owner originally typed — lands in the audit log
  lang: Lang // detected from the owner's message (thread fallback, default en)
}

export interface ChatAction {
  label: string
  command: string
}

export interface AgentReply {
  body: string
  actions?: ChatAction[]
}

// data    → read result, fed back to the LLM to compose its answer
// done    → mutation executed; reply is pushed to the thread verbatim
// pending → confirm-first proposal stored; reply carries yes/no buttons
// error   → guard refusal or resolution failure; reply pushed verbatim
export type ToolOutcome =
  | { kind: "data"; data: string }
  | { kind: "done"; reply: AgentReply }
  | { kind: "pending"; reply: AgentReply }
  | { kind: "error"; reply: AgentReply }

// The inverse tool call recorded on an executed action — powers "undo".
// Params are fully resolved (ids, not names) so it can run without the LLM.
export interface InverseCall {
  tool: string
  params: Record<string, unknown>
  preview: string
}

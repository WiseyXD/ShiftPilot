// Real WhatsApp transport — Meta Cloud API.
//
// The agent's brain (lib/whatsapp-sim/handler.ts) already speaks in
// (body, actions[{label, command}]) and persists every message to ChatMessage.
// That table is the outbox; this module mirrors it to a real phone. The
// in-app simulator keeps rendering the same rows, so both channels stay in
// sync and the simulator remains a working fallback if the venue wifi dies.
//
// Sends NEVER throw. pushAgentMessage runs inside Inngest `step.run`, and a
// throw there fails the step → retries → kills the workflow. That is exactly
// how a failing email once killed the replacement engine (see lib/email/send.ts,
// which was defanged for the same reason). Best-effort or nothing.

import type { ChatAction } from "@/lib/whatsapp-sim/handler"

const GRAPH_VERSION = "v21.0"

export function whatsappEnabled(): boolean {
  return (
    process.env.WHATSAPP_ENABLED === "true" &&
    !!process.env.WHATSAPP_PHONE_NUMBER_ID &&
    !!process.env.WHATSAPP_ACCESS_TOKEN
  )
}

// Meta wants E.164 without the leading "+". Employee.phone is "digits only"
// by convention but tolerate whatever a manager actually typed.
export const normalizePhone = (raw: string | null | undefined): string =>
  (raw ?? "").replace(/\D/g, "")

// E.164 replaces the national trunk prefix with the country code: a German
// manager types "0151 2345678", Meta's webhook says "491512345678". Dropping
// leading zeros makes the shorter form a true suffix of the longer one.
const significant = (digits: string) => digits.replace(/^0+/, "")

// Two numbers match if they're identical, or if one is a suffix of the other
// across at least 9 significant digits — enough that two real staff can't
// collide, loose enough to survive however the manager typed it.
export function phoneMatches(a: string, b: string): boolean {
  const x = significant(normalizePhone(a))
  const y = significant(normalizePhone(b))
  if (!x || !y) return false
  if (x === y) return true
  const [short, long] = x.length < y.length ? [x, y] : [y, x]
  return short.length >= 9 && long.endsWith(short)
}

// ── WhatsApp payload limits ──────────────────────────────────────────────────
// Interactive: ≤3 reply buttons (title ≤20 chars) OR a list of ≤10 rows
// (title ≤24 chars). Bodies ≤1024 chars interactive / ≤4096 plain text.
// Emoji are multi-byte, so slice by code point, never by UTF-16 index.
const MAX_BUTTONS = 3
const MAX_LIST_ROWS = 10
const BUTTON_TITLE = 20
const ROW_TITLE = 24
const INTERACTIVE_BODY = 1024
const TEXT_BODY = 4096

function clamp(s: string, max: number): string {
  const chars = [...s]
  return chars.length <= max ? s : chars.slice(0, max - 1).join("") + "…"
}

// Exported for tests: the button/list threshold is the one thing that would
// silently fail on stage (Meta rejects >3 buttons with a 400).
export function buildPayload(to: string, body: string, actions?: ChatAction[]) {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to }

  if (!actions?.length) {
    return { ...base, type: "text", text: { body: clamp(body, TEXT_BODY) } }
  }

  // ≤3 → reply buttons (the common case: Accept/Decline/Swap, Yes/No).
  if (actions.length <= MAX_BUTTONS) {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: clamp(body, INTERACTIVE_BODY) },
        action: {
          buttons: actions.map((a) => ({
            type: "reply",
            reply: { id: a.command, title: clamp(a.label, BUTTON_TITLE) },
          })),
        },
      },
    }
  }

  // >3 → a list. The weekly availability ask emits one button per shift slot
  // (availability-collection.ts), which routinely exceeds the button ceiling.
  return {
    ...base,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: clamp(body, INTERACTIVE_BODY) },
      action: {
        button: "Choose",
        sections: [
          {
            title: "Options",
            rows: actions.slice(0, MAX_LIST_ROWS).map((a) => ({
              id: a.command,
              title: clamp(a.label, ROW_TITLE),
            })),
          },
        ],
      },
    },
  }
}

/**
 * Mirror one agent message to a real WhatsApp number. Silent no-op when the
 * channel is off or the employee has no phone — the ChatMessage row is already
 * written, so the in-app simulator shows it either way.
 */
export async function sendWhatsApp(
  phone: string | null | undefined,
  body: string,
  actions?: ChatAction[]
): Promise<void> {
  if (!whatsappEnabled()) return

  const to = normalizePhone(phone)
  if (!to) return

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(to, body, actions)),
      }
    )

    if (!res.ok) {
      // The two that will actually bite you on stage:
      //   131030 — recipient not in the test number's allowlist
      //   131047 — outside the 24h service window (user must message you first)
      console.error(`[whatsapp] send to ${to} failed (${res.status}):`, await res.text())
    }
  } catch (err) {
    console.error("[whatsapp] send threw (continuing):", err)
  }
}

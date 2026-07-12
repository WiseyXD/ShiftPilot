// Meta WhatsApp Cloud API webhook — the inbound half of the real channel.
//
// Everything an employee taps or types on their real phone lands here and is
// dispatched into handleEmployeeMessage, the exact same front door the in-app
// simulator uses. No second code path, no second set of guards: a real "Call
// in sick" runs the identical compliance checks and fires the identical Inngest
// replacement workflow as a simulated one.
//
// Public by design — proxy.ts only guards /dashboard. Authenticity comes from
// the X-Hub-Signature-256 HMAC, not from a session.

import { createHmac, timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/prisma/client"
import { handleEmployeeMessage } from "@/lib/whatsapp-sim/handler"
import { normalizePhone, phoneMatches } from "@/lib/whatsapp/cloud"

// ── GET: Meta's subscription handshake ───────────────────────────────────────
// Meta calls this once when you save the callback URL and expects the challenge
// echoed back as bare text. Returning JSON here fails verification.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const mode = params.get("hub.mode")
  const token = params.get("hub.verify_token")
  const challenge = params.get("hub.challenge")

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    })
  }
  return new NextResponse("Forbidden", { status: 403 })
}

// ── POST: inbound messages ───────────────────────────────────────────────────

function verifySignature(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret) return false
  if (!header?.startsWith("sha256=")) return false

  const expected = createHmac("sha256", secret).update(raw).digest()
  const got = Buffer.from(header.slice("sha256=".length), "hex")
  return expected.length === got.length && timingSafeEqual(expected, got)
}

async function findEmployeeByPhone(from: string) {
  const digits = normalizePhone(from)
  if (!digits) return null

  const exact = await prisma.employee.findFirst({
    where: { phone: digits },
    select: { id: true, name: true },
  })
  if (exact) return exact

  // Managers type numbers however they like ("0151…" vs Meta's "49151…"), so
  // fall back to a suffix comparison across the (small) set of phoned staff.
  const candidates = await prisma.employee.findMany({
    where: { phone: { not: null } },
    select: { id: true, name: true, phone: true },
  })
  return candidates.find((e) => phoneMatches(e.phone!, digits)) ?? null
}

interface WaMessage {
  id: string
  from: string
  type: string
  text?: { body: string }
  interactive?: {
    type: string
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string }
  }
}

// A tapped button/list row gives us both the machine id (our command string,
// e.g. "SICK:ckabc") and the human title. Route on the id, show the title.
function extract(msg: WaMessage): { route: string; display: string } | null {
  if (msg.type === "text" && msg.text?.body) {
    const body = msg.text.body.trim()
    return body ? { route: body, display: body } : null
  }
  if (msg.type === "interactive") {
    const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply
    if (reply) return { route: reply.id, display: reply.title }
  }
  return null // media, reactions, stickers — nothing to act on
}

export async function POST(req: NextRequest) {
  const raw = await req.text()

  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: true }) // malformed — never make Meta retry
  }

  const entries = (body as { entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[] }).entry ?? []

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      // `statuses` payloads (sent/delivered/read receipts) have no `messages`.
      for (const msg of change.value?.messages ?? []) {
        const parsed = extract(msg)
        if (!parsed) continue

        const employee = await findEmployeeByPhone(msg.from)
        if (!employee) {
          console.warn(`[whatsapp] message from unknown number ${msg.from} — ignoring`)
          continue
        }

        try {
          // waMessageId makes this idempotent: Meta retries until it sees a
          // 200, and the row is written before any workflow fires, so a retry
          // that arrives mid-flight bails instead of double-firing.
          await handleEmployeeMessage(employee.id, parsed.route, {
            display: parsed.display,
            waMessageId: msg.id,
          })
        } catch (err) {
          console.error(`[whatsapp] handling message ${msg.id} failed:`, err)
        }
      }
    }
  }

  // Always 200. A non-2xx puts Meta into a retry loop that will re-deliver
  // every message in the batch, including the ones that succeeded.
  return NextResponse.json({ ok: true })
}

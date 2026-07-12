import { describe, it, expect } from "vitest"
import { buildPayload, normalizePhone, phoneMatches } from "../cloud"

describe("normalizePhone", () => {
  it("strips everything that isn't a digit", () => {
    expect(normalizePhone("+49 151 / 234-5678")).toBe("491512345678")
  })
  it("is safe on null/undefined/empty", () => {
    expect(normalizePhone(null)).toBe("")
    expect(normalizePhone(undefined)).toBe("")
  })
})

describe("phoneMatches", () => {
  it("matches identical numbers regardless of formatting", () => {
    expect(phoneMatches("+49 151 2345678", "491512345678")).toBe(true)
  })

  it("matches a national number against Meta's E.164 form", () => {
    // The manager types "0151…"; Meta's webhook says "49151…".
    expect(phoneMatches("01512345678", "491512345678")).toBe(true)
  })

  it("rejects different numbers", () => {
    expect(phoneMatches("491512345678", "491519999999")).toBe(false)
  })

  it("refuses to match on a short suffix — two staff must never collide", () => {
    expect(phoneMatches("5678", "491512345678")).toBe(false)
  })

  it("is false when either side is missing", () => {
    expect(phoneMatches("", "491512345678")).toBe(false)
  })
})

describe("buildPayload", () => {
  const to = "491512345678"

  it("sends a plain text message when there are no actions", () => {
    const p = buildPayload(to, "Get well soon!") as { type: string; text: { body: string } }
    expect(p.type).toBe("text")
    expect(p.text.body).toBe("Get well soon!")
  })

  it("uses reply buttons for the common ≤3 case", () => {
    const p = buildPayload(to, "Your shift", [
      { label: "✅ Accept", command: "ACCEPT:s1" },
      { label: "❌ Decline", command: "DECLINE:s1" },
      { label: "🔁 Swap", command: "SWAP:s1" },
    ]) as { interactive: { type: string; action: { buttons: { reply: { id: string; title: string } }[] } } }

    expect(p.interactive.type).toBe("button")
    // The command string is the id we route on — it must survive verbatim.
    expect(p.interactive.action.buttons.map((b) => b.reply.id)).toEqual([
      "ACCEPT:s1",
      "DECLINE:s1",
      "SWAP:s1",
    ])
  })

  it("falls back to a list past 3 actions — the weekly availability ask", () => {
    // availability-collection emits "All good" + one button per shift slot,
    // which blows the 3-button ceiling on any real roster.
    const actions = [
      { label: "✅ All good", command: "AVAIL_OK:123" },
      ...Array.from({ length: 5 }, (_, i) => ({
        label: `❌ Mon Morning ${i}`,
        command: `AVAIL_NO:t1:${i}:123`,
      })),
    ]
    const p = buildPayload(to, "What can't you work?", actions) as {
      interactive: { type: string; action: { sections: { rows: { id: string }[] }[] } }
    }

    expect(p.interactive.type).toBe("list")
    expect(p.interactive.action.sections[0].rows).toHaveLength(6)
    expect(p.interactive.action.sections[0].rows[0].id).toBe("AVAIL_OK:123")
  })

  it("caps a list at WhatsApp's 10-row limit", () => {
    const actions = Array.from({ length: 14 }, (_, i) => ({
      label: `Slot ${i}`,
      command: `AVAIL_NO:t1:${i}:123`,
    }))
    const p = buildPayload(to, "Pick", actions) as {
      interactive: { action: { sections: { rows: unknown[] }[] } }
    }
    expect(p.interactive.action.sections[0].rows).toHaveLength(10)
  })

  it("truncates over-long button titles by code point, not UTF-16 index", () => {
    // Meta rejects titles >20 chars; naive .slice() would sever an emoji into
    // a lone surrogate and Meta 400s on the malformed string.
    const p = buildPayload(to, "x", [
      { label: "🤒 Call in sick for the Friday evening shift", command: "SICK:s1" },
    ]) as { interactive: { action: { buttons: { reply: { title: string } }[] } } }

    const title = p.interactive.action.buttons[0].reply.title
    expect([...title].length).toBeLessThanOrEqual(20)
    expect(title.startsWith("🤒")).toBe(true)
  })
})

import { describe, it, expect } from "vitest"
import {
  buildWhatsAppUrl,
  buildWorkerNudgeMessage,
  buildManagerNudgeMessage,
} from "../whatsapp"

describe("buildWhatsAppUrl", () => {
  it("URL-encodes the message text so links and punctuation survive WhatsApp", () => {
    const url = buildWhatsAppUrl("Accept: https://x.test/api/token/abc?x=1&y=2 — thanks!")
    expect(url.startsWith("https://wa.me/?text=")).toBe(true)
    const text = new URL(url).searchParams.get("text")
    expect(text).toBe("Accept: https://x.test/api/token/abc?x=1&y=2 — thanks!")
    // The raw & of the embedded link must not leak into the wa.me query string.
    expect(new URL(url).searchParams.get("y")).toBeNull()
  })

  it("targets a phone number when one is provided", () => {
    const url = buildWhatsAppUrl("hi", "491701234567")
    expect(url.startsWith("https://wa.me/491701234567?text=")).toBe(true)
  })

  it("keeps newlines intact through encoding", () => {
    const url = buildWhatsAppUrl("line one\nline two")
    expect(new URL(url).searchParams.get("text")).toBe("line one\nline two")
  })
})

describe("buildWorkerNudgeMessage", () => {
  const message = buildWorkerNudgeMessage({
    workerName: "Lena",
    role: "Barista",
    venueName: "Borrower Bistro",
    dateLabel: "Friday 10 Jul",
    window: "17:00–22:00",
    rateLabel: "€18.50/h",
    acceptUrl: "https://x.test/api/token/accept-123",
    declineUrl: "https://x.test/api/token/decline-456",
  })

  it("carries the shift facts and both token links — the same choice the email offers", () => {
    for (const expected of [
      "Lena",
      "Barista",
      "Borrower Bistro",
      "Friday 10 Jul",
      "17:00–22:00",
      "€18.50/h",
      "https://x.test/api/token/accept-123",
      "https://x.test/api/token/decline-456",
    ]) {
      expect(message).toContain(expected)
    }
  })
})

describe("buildManagerNudgeMessage", () => {
  it("asks for confirmation and links the marketplace — no token, same as the email path", () => {
    const message = buildManagerNudgeMessage({
      role: "Server",
      dateLabel: "Friday 10 Jul",
      window: "18:00–23:00",
      marketplaceUrl: "https://x.test/dashboard/marketplace?location=loc-1",
    })
    expect(message).toContain("Server")
    expect(message).toContain("Friday 10 Jul")
    expect(message).toContain("https://x.test/dashboard/marketplace?location=loc-1")
    expect(message).not.toContain("/api/token/")
  })
})

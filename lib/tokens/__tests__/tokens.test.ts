import { describe, it, expect } from "vitest"
import { validateToken } from "../validate"
import type { StoredToken } from "../validate"

const base: StoredToken = {
  id: "tok_test",
  action: "ACCEPT_SHIFT",
  payload: { shiftId: "shift_1" },
  expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1hr from now
  usedAt: null,
}

describe("validateToken", () => {
  it("returns payload for a valid unused unexpired token", () => {
    const result = validateToken(base)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload).toEqual({ shiftId: "shift_1" })
  })

  it("rejects a token that has already expired", () => {
    const expired = { ...base, expiresAt: new Date(Date.now() - 1) }
    const result = validateToken(expired)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("expired")
  })

  it("rejects a token that has already been used", () => {
    const consumed = { ...base, usedAt: new Date(Date.now() - 60_000) }
    const result = validateToken(consumed)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("consumed")
  })

  it("rejects null (token not found)", () => {
    const result = validateToken(null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("not_found")
  })

  it("expiry check uses consumed before expired when both apply", () => {
    const both = {
      ...base,
      expiresAt: new Date(Date.now() - 1),
      usedAt: new Date(Date.now() - 60_000),
    }
    const result = validateToken(both)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("consumed")
  })
})

import { describe, it, expect } from "vitest"
import {
  buildDealFromListing,
  applyDealAction,
  applyWorkerResponse,
  canSeeWorkerName,
} from "../deals"

const offerListing = {
  type: "OFFER" as const,
  status: "OPEN" as const,
  locationId: "loc-lender",
  employeeId: "emp-alice",
  hourlyRateCents: 1800,
}

const requestListing = {
  type: "REQUEST" as const,
  status: "OPEN" as const,
  locationId: "loc-borrower",
  employeeId: null,
  hourlyRateCents: null,
}

describe("buildDealFromListing", () => {
  it("responding to an OFFER borrows the listed employee at the listed rate", () => {
    const result = buildDealFromListing(offerListing, {
      locationId: "loc-responder",
      employeeId: null,
    })

    expect(result).toEqual({
      ok: true,
      value: {
        lenderLocationId: "loc-lender",
        borrowerLocationId: "loc-responder",
        employeeId: "emp-alice",
        agreedRateCents: 1800,
      },
    })
  })

  it("responding to a REQUEST lends the responder's chosen employee to the listing venue", () => {
    const result = buildDealFromListing(requestListing, {
      locationId: "loc-responder",
      employeeId: "emp-bob",
    })

    expect(result).toEqual({
      ok: true,
      value: {
        lenderLocationId: "loc-responder",
        borrowerLocationId: "loc-borrower",
        employeeId: "emp-bob",
        agreedRateCents: null,
      },
    })
  })

  it("refuses a REQUEST response without a chosen employee", () => {
    const result = buildDealFromListing(requestListing, {
      locationId: "loc-responder",
      employeeId: null,
    })
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/employee/i) })
  })

  it("refuses an OFFER listing that somehow has no employee attached", () => {
    const broken = { ...offerListing, employeeId: null }
    const result = buildDealFromListing(broken, { locationId: "loc-r", employeeId: null })
    expect(result.ok).toBe(false)
  })

  it("refuses to respond to a listing that is not OPEN", () => {
    for (const status of ["CANCELLED", "MATCHED"] as const) {
      const result = buildDealFromListing({ ...offerListing, status }, {
        locationId: "loc-r",
        employeeId: null,
      })
      expect(result).toEqual({ ok: false, error: expect.stringMatching(/no longer open/i) })
    }
  })
})

describe("applyDealAction", () => {
  it("lets the listing owner confirm a pending deal — managers are then agreed", () => {
    expect(applyDealAction("AWAITING_MANAGER", "LISTING_OWNER", "CONFIRM")).toEqual({
      ok: true,
      next: "MANAGERS_AGREED",
    })
  })

  it("does not let the responder confirm — they already consented by responding", () => {
    const result = applyDealAction("AWAITING_MANAGER", "RESPONDER", "CONFIRM")
    expect(result.ok).toBe(false)
  })

  it("lets either manager decline while pending", () => {
    for (const actor of ["LISTING_OWNER", "RESPONDER"] as const) {
      expect(applyDealAction("AWAITING_MANAGER", actor, "DECLINE")).toEqual({
        ok: true,
        next: "DECLINED",
      })
    }
  })

  it("treats DECLINED as terminal — a declined deal cannot be revived", () => {
    for (const action of ["CONFIRM", "DECLINE"] as const) {
      expect(applyDealAction("DECLINED", "LISTING_OWNER", action).ok).toBe(false)
    }
  })

  it("locks MANAGERS_AGREED — manager actions are over, worker consent owns the next step", () => {
    for (const action of ["CONFIRM", "DECLINE"] as const) {
      expect(applyDealAction("MANAGERS_AGREED", "RESPONDER", action).ok).toBe(false)
    }
  })

  it("locks worker-outcome statuses against manager actions too", () => {
    for (const status of ["FILLED", "WORKER_DECLINED", "EXPIRED"] as const) {
      expect(applyDealAction(status, "LISTING_OWNER", "DECLINE").ok).toBe(false)
    }
  })
})

describe("applyWorkerResponse", () => {
  it("accepting from MANAGERS_AGREED fills the deal", () => {
    expect(applyWorkerResponse("MANAGERS_AGREED", "ACCEPT_LOAN")).toEqual({
      ok: true,
      next: "FILLED",
    })
  })

  it("declining from MANAGERS_AGREED marks the worker's refusal", () => {
    expect(applyWorkerResponse("MANAGERS_AGREED", "DECLINE_LOAN")).toEqual({
      ok: true,
      next: "WORKER_DECLINED",
    })
  })

  it("refuses in every other status — a settled deal can't be flipped by a stale link", () => {
    for (const status of [
      "AWAITING_MANAGER",
      "DECLINED",
      "FILLED",
      "WORKER_DECLINED",
      "EXPIRED",
    ] as const) {
      for (const response of ["ACCEPT_LOAN", "DECLINE_LOAN"] as const) {
        const result = applyWorkerResponse(status, response)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
      }
    }
  })
})

describe("canSeeWorkerName", () => {
  it("the lender always sees their own employee", () => {
    for (const status of ["AWAITING_MANAGER", "MANAGERS_AGREED", "FILLED", "DECLINED"] as const) {
      expect(canSeeWorkerName(true, status)).toBe(true)
    }
  })

  it("the borrower sees the name only once the deal is FILLED", () => {
    expect(canSeeWorkerName(false, "FILLED")).toBe(true)
    for (const status of [
      "AWAITING_MANAGER",
      "MANAGERS_AGREED",
      "DECLINED",
      "WORKER_DECLINED",
      "EXPIRED",
    ] as const) {
      expect(canSeeWorkerName(false, status)).toBe(false)
    }
  })
})

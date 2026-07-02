// Deal construction + status transitions. Pure — the server actions own auth,
// DB reads, and race-guarded writes; every decision that matters lives here.

import type { ListingType } from "./listings"

export type SharingDealStatus =
  | "AWAITING_MANAGER"
  | "MANAGERS_AGREED"
  | "DECLINED"
  | "FILLED"
  | "WORKER_DECLINED"
  | "EXPIRED"
export type DealActor = "LISTING_OWNER" | "RESPONDER"
export type DealAction = "CONFIRM" | "DECLINE"
export type WorkerResponse = "ACCEPT_LOAN" | "DECLINE_LOAN"

interface RespondableListing {
  type: ListingType
  status: string
  locationId: string
  employeeId: string | null
  hourlyRateCents: number | null
}

interface Responder {
  locationId: string
  employeeId: string | null
}

export interface DealDraft {
  lenderLocationId: string
  borrowerLocationId: string
  employeeId: string
  agreedRateCents: number | null
}

export type DealBuildResult = { ok: true; value: DealDraft } | { ok: false; error: string }

export function buildDealFromListing(
  listing: RespondableListing,
  responder: Responder
): DealBuildResult {
  if (listing.status !== "OPEN") {
    return { ok: false, error: "This listing is no longer open" }
  }

  if (listing.type === "OFFER") {
    // The listing venue is lending its named employee to the responder.
    if (!listing.employeeId) {
      return { ok: false, error: "This offer has no employee attached" }
    }
    return {
      ok: true,
      value: {
        lenderLocationId: listing.locationId,
        borrowerLocationId: responder.locationId,
        employeeId: listing.employeeId,
        agreedRateCents: listing.hourlyRateCents,
      },
    }
  }

  // REQUEST: the responder lends one of their own employees to the listing venue.
  if (!responder.employeeId) {
    return { ok: false, error: "Pick which employee you want to lend" }
  }
  return {
    ok: true,
    value: {
      lenderLocationId: responder.locationId,
      borrowerLocationId: listing.locationId,
      employeeId: responder.employeeId,
      agreedRateCents: listing.hourlyRateCents,
    },
  }
}

export type DealTransition = { ok: true; next: SharingDealStatus } | { ok: false; error: string }

export function applyDealAction(
  status: SharingDealStatus,
  actor: DealActor,
  action: DealAction
): DealTransition {
  if (status !== "AWAITING_MANAGER") {
    return {
      ok: false,
      error:
        status === "DECLINED"
          ? "This deal was declined and can't be reopened"
          : status === "MANAGERS_AGREED"
            ? "Both managers already agreed — it's with the worker now"
            : "This deal is already settled",
    }
  }

  if (action === "DECLINE") return { ok: true, next: "DECLINED" }

  // CONFIRM: only the listing owner has a pending decision; the responder
  // consented by responding in the first place.
  if (actor !== "LISTING_OWNER") {
    return { ok: false, error: "Only the venue that posted the listing can confirm" }
  }
  return { ok: true, next: "MANAGERS_AGREED" }
}

const WORKER_GUARD_MESSAGES: Record<Exclude<SharingDealStatus, "MANAGERS_AGREED">, string> = {
  AWAITING_MANAGER: "The managers haven't both agreed yet — hang tight.",
  DECLINED: "This deal was declined by a manager, so there's nothing to respond to.",
  FILLED: "You've already accepted this loan.",
  WORKER_DECLINED: "You've already declined this loan.",
  EXPIRED: "This request expired before you responded — ask your manager if it's still on.",
}

export function applyWorkerResponse(
  status: SharingDealStatus,
  response: WorkerResponse
): DealTransition {
  if (status !== "MANAGERS_AGREED") {
    return { ok: false, error: WORKER_GUARD_MESSAGES[status] }
  }
  return { ok: true, next: response === "ACCEPT_LOAN" ? "FILLED" : "WORKER_DECLINED" }
}

// Anti-poaching reveal rule: the lender always knows their own employee; the
// borrower learns the name only after the worker has said yes.
export function canSeeWorkerName(isLender: boolean, status: SharingDealStatus): boolean {
  return isLender || status === "FILLED"
}

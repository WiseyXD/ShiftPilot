// Deal construction + status transitions. Pure — the server actions own auth,
// DB reads, and race-guarded writes; every decision that matters lives here.

import type { ListingType } from "./listings"

export type SharingDealStatus = "AWAITING_MANAGER" | "MANAGERS_AGREED" | "DECLINED"
export type DealActor = "LISTING_OWNER" | "RESPONDER"
export type DealAction = "CONFIRM" | "DECLINE"

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
          : "Both managers already agreed — it's with the worker now",
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

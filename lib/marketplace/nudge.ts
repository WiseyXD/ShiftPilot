// Builds the wa.me redirect for a deal that's waiting on someone. The worker
// nudge reuses the SAME pending tokens the consent email carries (re-issuing
// only if expired) — one token per action, so WhatsApp and email can't
// double-fire; the usedAt guard settles whichever is tapped second.

import { prisma } from "@/prisma/client"
import { generateToken } from "@/lib/tokens/generate"
import type { ActionTokenAction } from "@/prisma/generated/client/client"
import { formatRate } from "./listings"
import {
  buildWhatsAppUrl,
  buildWorkerNudgeMessage,
  buildManagerNudgeMessage,
} from "./whatsapp"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

const formatLoanDate = (date: Date) =>
  date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })

async function loanToken(employeeId: string, action: ActionTokenAction, dealId: string) {
  const existing = await prisma.actionToken.findFirst({
    where: {
      employeeId,
      action,
      usedAt: null,
      expiresAt: { gt: new Date() },
      payload: { path: ["dealId"], equals: dealId },
    },
    orderBy: { createdAt: "desc" },
  })
  return existing ?? generateToken(employeeId, action, { dealId })
}

export type NudgeResult = { ok: true; url: string } | { ok: false; error: string }

export async function buildNudgeUrl(dealId: string, userId: string): Promise<NudgeResult> {
  const deal = await prisma.sharingDeal.findUnique({
    where: { id: dealId },
    include: {
      listing: true,
      employee: { select: { name: true } },
      lenderLocation: { select: { id: true, ownerId: true } },
      borrowerLocation: { select: { id: true, ownerId: true, name: true } },
    },
  })
  if (!deal) return { ok: false, error: "Deal not found" }

  const isLenderOwner = deal.lenderLocation.ownerId === userId
  const isBorrowerOwner = deal.borrowerLocation.ownerId === userId
  if (!isLenderOwner && !isBorrowerOwner) {
    return { ok: false, error: "This deal doesn't involve any of your venues" }
  }

  const dateLabel = formatLoanDate(new Date(deal.listing.date))
  const window = `${deal.listing.startTime}–${deal.listing.endTime}`

  if (deal.status === "AWAITING_MANAGER") {
    // The pending action belongs to the listing owner — only the responder
    // has someone to nudge.
    const listingOwnedByLender = deal.listing.locationId === deal.lenderLocation.id
    const userIsResponder = listingOwnedByLender ? isBorrowerOwner : isLenderOwner
    if (!userIsResponder) {
      return { ok: false, error: "The confirmation is on your side — it's you being waited on" }
    }
    const message = buildManagerNudgeMessage({
      role: deal.listing.role,
      dateLabel,
      window,
      marketplaceUrl: `${APP_URL}/dashboard/marketplace?location=${deal.listing.locationId}`,
    })
    return { ok: true, url: buildWhatsAppUrl(message) }
  }

  if (deal.status === "MANAGERS_AGREED") {
    // Only the lender knows the worker — and only they may carry the tokens.
    if (!isLenderOwner) {
      return { ok: false, error: "Only the lending venue can nudge their worker" }
    }
    const [acceptToken, declineToken] = await Promise.all([
      loanToken(deal.employeeId, "ACCEPT_LOAN", deal.id),
      loanToken(deal.employeeId, "DECLINE_LOAN", deal.id),
    ])
    const message = buildWorkerNudgeMessage({
      workerName: deal.employee.name,
      role: deal.listing.role,
      venueName: deal.borrowerLocation.name,
      dateLabel,
      window,
      rateLabel: formatRate(deal.agreedRateCents),
      acceptUrl: `${APP_URL}/api/token/${acceptToken.id}`,
      declineUrl: `${APP_URL}/api/token/${declineToken.id}`,
    })
    return { ok: true, url: buildWhatsAppUrl(message) }
  }

  return { ok: false, error: "This deal isn't waiting on anyone" }
}

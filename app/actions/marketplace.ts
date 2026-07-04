"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { geocodeAddress } from "@/lib/marketplace/geocode"
import { validateListingInput, formatRate, type ListingType } from "@/lib/marketplace/listings"
import { buildDealFromListing, applyDealAction, type DealAction } from "@/lib/marketplace/deals"
import { filterNearbyVenues } from "@/lib/marketplace/discovery"
import { isOnVacation } from "@/lib/scheduling/vacation"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import { inngest } from "@/lib/inngest/client"
import { revalidatePath } from "next/cache"

type ActionState = { error: string } | null

async function ownedLocation(locationId: string, ownerId: string) {
  return prisma.location.findFirst({ where: { id: locationId, ownerId } })
}

export async function updateDiscoverySettings(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }

  const locationId = formData.get("locationId") as string
  const location = await ownedLocation(locationId, session.user.id)
  if (!location) return { error: "Location not found" }

  const address = ((formData.get("address") as string) ?? "").trim() || null
  const isDiscoverable = formData.get("isDiscoverable") === "on"
  const radius = parseInt(formData.get("discoveryRadiusKm") as string)
  const discoveryRadiusKm =
    !isNaN(radius) && radius >= 1 ? radius : location.discoveryRadiusKm

  if (isDiscoverable && !address) {
    return { error: "Add your venue's address before turning on discovery" }
  }

  let lat = location.lat
  let lng = location.lng
  if (address && (address !== location.address || lat == null)) {
    const point = await geocodeAddress(address)
    if (!point) {
      return { error: "Couldn't find that address on the map — try adding street, city, and postcode" }
    }
    lat = point.lat
    lng = point.lng
  }
  if (!address) {
    lat = null
    lng = null
  }

  await prisma.location.update({
    where: { id: location.id },
    data: { address, lat, lng, isDiscoverable, discoveryRadiusKm },
  })

  revalidatePath("/dashboard/marketplace")
  return null
}

export async function createListing(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }

  const locationId = formData.get("locationId") as string
  const location = await ownedLocation(locationId, session.user.id)
  if (!location) return { error: "Location not found" }

  const rateRaw = ((formData.get("hourlyRate") as string) ?? "").trim()
  const rateEuros = rateRaw ? Number(rateRaw) : null
  if (rateEuros !== null && Number.isNaN(rateEuros)) {
    return { error: "Rate must be a number, or leave it blank for negotiable" }
  }

  const result = validateListingInput(
    {
      type: formData.get("type") as ListingType,
      role: (formData.get("role") as string) ?? "",
      date: (formData.get("date") as string) ?? "",
      startTime: (formData.get("startTime") as string) ?? "",
      endTime: (formData.get("endTime") as string) ?? "",
      employeeId: ((formData.get("employeeId") as string) ?? "").trim() || null,
      hourlyRateCents: rateEuros === null ? null : Math.round(rateEuros * 100),
    },
    new Date()
  )
  if (!result.ok) return { error: result.error }
  const listing = result.value

  if (listing.employeeId) {
    const employee = await prisma.employee.findFirst({
      where: { id: listing.employeeId, locationId: location.id },
      include: { vacations: true },
    })
    if (!employee) return { error: "That employee doesn't belong to this location" }
    if (isOnVacation(employee.vacations, employee.id, new Date(listing.date))) {
      return { error: `${employee.name} is on vacation on that date` }
    }
  }

  await prisma.sharingListing.create({
    data: { locationId: location.id, ...listing },
  })

  revalidatePath("/dashboard/marketplace")
  return null
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

// Notification failures must never roll back a deal that was already written.
async function notifyManager(email: string, heading: string, body: string, locationId: string) {
  try {
    await sendEmail({
      to: email,
      subject: heading,
      react: NotificationEmail({
        heading,
        body,
        ctaLabel: "Open marketplace",
        ctaUrl: `${APP_URL}/dashboard/marketplace?location=${locationId}`,
      }),
    })
  } catch (err) {
    console.error("marketplace notification failed:", err)
  }
}

const describeWindow = (l: { role: string; date: Date; startTime: string; endTime: string }) =>
  `${l.role} on ${l.date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })}, ${l.startTime}–${l.endTime}`

export async function respondToListing(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }

  const respondingLocation = await ownedLocation(
    formData.get("respondingLocationId") as string,
    session.user.id
  )
  if (!respondingLocation) return { error: "Location not found" }

  const listing = await prisma.sharingListing.findUnique({
    where: { id: formData.get("listingId") as string },
    include: {
      location: { include: { owner: { select: { id: true, email: true } } } },
      deals: { where: { status: { not: "DECLINED" } }, select: { id: true } },
    },
  })
  if (!listing) return { error: "Listing not found" }
  if (listing.location.owner.id === session.user.id) {
    return { error: "You can't respond to your own listing" }
  }
  if (listing.deals.length > 0) {
    return { error: "Someone already responded — this listing has a pending deal" }
  }
  // Re-check mutual discoverability server-side; the feed isn't the only door in.
  if (
    !respondingLocation.isDiscoverable ||
    filterNearbyVenues(respondingLocation, [listing.location]).length === 0
  ) {
    return { error: "This venue isn't within your mutual discovery range" }
  }

  const employeeId = ((formData.get("employeeId") as string) ?? "").trim() || null
  const draft = buildDealFromListing(listing, {
    locationId: respondingLocation.id,
    employeeId,
  })
  if (!draft.ok) return { error: draft.error }

  if (listing.type === "REQUEST") {
    const employee = await prisma.employee.findFirst({
      where: { id: draft.value.employeeId, locationId: respondingLocation.id },
      include: { vacations: true },
    })
    if (!employee) return { error: "That employee doesn't belong to this location" }
    if (isOnVacation(employee.vacations, employee.id, new Date(listing.date))) {
      return { error: `${employee.name} is on vacation on that date` }
    }
  }

  await prisma.sharingDeal.create({ data: { listingId: listing.id, ...draft.value } })

  await notifyManager(
    listing.location.owner.email,
    "New response to your marketplace listing",
    `${respondingLocation.name} responded to your listing for ${describeWindow(listing)} (${formatRate(
      listing.hourlyRateCents
    )}). Confirm or decline it in your marketplace.`,
    listing.locationId
  )

  revalidatePath("/dashboard/marketplace")
  return null
}

async function actOnDeal(dealId: string, action: DealAction, userId: string) {
  const deal = await prisma.sharingDeal.findUnique({
    where: { id: dealId },
    include: {
      listing: { select: { id: true, type: true, role: true, date: true, startTime: true, endTime: true, locationId: true } },
      lenderLocation: { include: { owner: { select: { id: true, email: true } } } },
      borrowerLocation: { include: { owner: { select: { id: true, email: true } } } },
    },
  })
  if (!deal) return

  const listingSide =
    deal.listing.locationId === deal.lenderLocationId ? deal.lenderLocation : deal.borrowerLocation
  const responderSide =
    listingSide.id === deal.lenderLocationId ? deal.borrowerLocation : deal.lenderLocation

  const actor =
    listingSide.owner.id === userId
      ? ("LISTING_OWNER" as const)
      : responderSide.owner.id === userId
        ? ("RESPONDER" as const)
        : null
  if (!actor) return

  const transition = applyDealAction(deal.status, actor, action)
  if (!transition.ok) return

  // Guarded write: if the status moved under us, do nothing.
  const { count } = await prisma.sharingDeal.updateMany({
    where: { id: deal.id, status: "AWAITING_MANAGER" },
    data: { status: transition.next },
  })
  if (count === 0) return

  if (transition.next === "MANAGERS_AGREED") {
    // Off the feed — the deal now owns this listing. A decline keeps it OPEN.
    await prisma.sharingListing.update({
      where: { id: deal.listing.id },
      data: { status: "MATCHED" },
    })
    // Kick off the durable worker-consent workflow (email + waitForEvent).
    await inngest.send({ name: "marketplace/loan.agreed", data: { dealId: deal.id } })
  }

  const other = actor === "LISTING_OWNER" ? responderSide : listingSide
  await notifyManager(
    other.owner.email,
    transition.next === "MANAGERS_AGREED"
      ? "Deal confirmed — awaiting worker consent"
      : "Marketplace deal declined",
    transition.next === "MANAGERS_AGREED"
      ? `Both managers agreed on ${describeWindow(deal.listing)}. Next step: the worker will be asked to consent.`
      : `The deal for ${describeWindow(deal.listing)} was declined. The listing stays open for other venues.`,
    other.id
  )

  revalidatePath("/dashboard/marketplace")
}

export async function confirmDeal(dealId: string) {
  const session = await auth()
  if (!session) return
  await actOnDeal(dealId, "CONFIRM", session.user.id)
}

export async function declineDeal(dealId: string) {
  const session = await auth()
  if (!session) return
  await actOnDeal(dealId, "DECLINE", session.user.id)
}

export async function cancelListing(listingId: string) {
  const session = await auth()
  if (!session) return

  // Only the owning venue can cancel, and only while the listing is still OPEN.
  await prisma.sharingListing.updateMany({
    where: { id: listingId, status: "OPEN", location: { ownerId: session.user.id } },
    data: { status: "CANCELLED" },
  })

  revalidatePath("/dashboard/marketplace")
}

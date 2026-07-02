"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { geocodeAddress } from "@/lib/marketplace/geocode"
import { validateListingInput, type ListingType } from "@/lib/marketplace/listings"
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
    })
    if (!employee) return { error: "That employee doesn't belong to this location" }
  }

  await prisma.sharingListing.create({
    data: { locationId: location.id, ...listing },
  })

  revalidatePath("/dashboard/marketplace")
  return null
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

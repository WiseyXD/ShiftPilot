"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { canAddLocation } from "@/lib/plan"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

type ActionState = { error: string } | null

export async function createLocation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }

  const name = (formData.get("name") as string)?.trim()
  const timezone = (formData.get("timezone") as string) || "UTC"
  if (!name) return { error: "Location name is required" }

  const locationCount = await prisma.location.count({
    where: { ownerId: session.user.id },
  })

  if (!canAddLocation(session.user.stripePlan, locationCount)) {
    return { error: "Starter plan is limited to 1 location. Upgrade to Pro to add more." }
  }

  const location = await prisma.location.create({
    data: { ownerId: session.user.id, name, timezone },
  })

  revalidatePath("/dashboard")
  redirect(`/dashboard/${location.id}`)
}

export async function deleteLocation(locationId: string) {
  const session = await auth()
  if (!session) return

  await prisma.location.deleteMany({
    where: { id: locationId, ownerId: session.user.id },
  })

  revalidatePath("/dashboard")
  redirect("/dashboard")
}

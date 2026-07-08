"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { canAddLocation, canAddEmployee } from "@/lib/plan"
import { geocodeAddress } from "@/lib/marketplace/geocode"
import { redirect } from "next/navigation"

export interface OnboardingTemplate {
  name: string
  startTime: string
  endTime: string
  minHeadcount: number
  requiredRoles: string[]
}

export interface OnboardingEmployee {
  name: string
  email: string
  category: "MINIJOB_ZEITARBEIT" | "TEILZEIT_FEST"
  roles: string[]
}

export interface OnboardingPayload {
  name: string
  timezone: string
  address: string
  generationDayOfWeek: number
  templates: OnboardingTemplate[]
  employees: OnboardingEmployee[]
}

// Commits a whole first-café setup in one transaction, then drops the manager
// on their new location. Everything is validated server-side; the wizard just
// collects it.
export async function completeOnboarding(
  payload: OnboardingPayload
): Promise<{ error: string } | void> {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }

  const name = payload.name?.trim()
  if (!name) return { error: "Give your café a name." }

  const locationCount = await prisma.location.count({ where: { ownerId: session.user.id } })
  if (!canAddLocation(session.user.stripePlan, locationCount)) {
    return { error: "Your plan is limited to 1 location. Upgrade to Pro to add more." }
  }

  const templates = (payload.templates ?? []).filter((t) => t.name?.trim())
  if (templates.length === 0) {
    return { error: "Add at least one shift so Covrly has something to schedule." }
  }

  // De-dup employees by email; respect the plan's headcount cap.
  const seen = new Set<string>()
  const employees = (payload.employees ?? [])
    .map((e) => ({ ...e, email: e.email?.trim().toLowerCase(), name: e.name?.trim() }))
    .filter((e) => e.name && e.email && !seen.has(e.email) && seen.add(e.email))
  if (!canAddEmployee(session.user.stripePlan, employees.length - 1)) {
    return { error: "That's more employees than your plan allows. Add the rest after upgrading." }
  }

  // Best-effort geocode so the marketplace works later — never block setup on it.
  let lat: number | null = null
  let lng: number | null = null
  const address = payload.address?.trim() || null
  if (address) {
    const point = await geocodeAddress(address).catch(() => null)
    if (point) {
      lat = point.lat
      lng = point.lng
    }
  }

  const location = await prisma.location.create({
    data: {
      ownerId: session.user.id,
      name,
      timezone: payload.timezone || "Europe/Berlin",
      generationDayOfWeek: payload.generationDayOfWeek ?? 3,
      address,
      lat,
      lng,
      shiftTemplates: {
        create: templates.map((t) => ({
          name: t.name.trim(),
          startTime: t.startTime,
          endTime: t.endTime,
          minHeadcount: Math.max(1, t.minHeadcount || 1),
          requiredRoles: t.requiredRoles ?? [],
        })),
      },
      employees: {
        create: employees.map((e) => ({
          name: e.name!,
          email: e.email!,
          category: e.category,
          roles: e.roles ?? [],
        })),
      },
    },
  })

  redirect(`/dashboard/${location.id}`)
}

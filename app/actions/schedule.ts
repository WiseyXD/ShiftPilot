"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { inngest } from "@/lib/inngest/client"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { isPro } from "@/lib/plan"

export async function approveSchedule(scheduleId: string, tokenId: string) {
  const session = await auth()
  if (!session) return

  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, location: { ownerId: session.user.id } },
  })
  if (!schedule || schedule.status !== "DRAFT") return

  // Consume approval token if provided
  if (tokenId) {
    const token = await prisma.actionToken.findUnique({ where: { id: tokenId } })
    if (token && !token.usedAt) {
      await prisma.actionToken.update({ where: { id: tokenId }, data: { usedAt: new Date() } })
    }
  }

  await prisma.schedule.update({
    where: { id: scheduleId },
    data: { status: "APPROVED" },
  })

  // Fire shift notification workflow
  await inngest.send({
    name: "schedule/approved",
    data: { scheduleId },
  })

  revalidatePath(`/dashboard/${schedule.locationId}/schedules/${scheduleId}`)
}

export async function manualGenerateSchedule(locationId: string) {
  const session = await auth()
  if (!session) redirect("/login")

  if (!isPro(session.user.stripePlan)) {
    return { error: "Manual schedule generation is a Pro feature." }
  }

  // Phase 1: ask the team what they can't work next week. The collection
  // workflow generates the draft automatically once everyone has replied
  // (or after its timeout).
  await inngest.send({
    name: "schedule/collect-availability",
    data: { locationId },
  })

  revalidatePath(`/dashboard/${locationId}`)
  return { ok: true }
}

// Escape hatch: build the draft right now, skipping the availability ask. Used
// by the "Build it now" affordance so a demo can't get stuck waiting on replies.
// Whoever has already confirmed is included; anyone who hasn't is dropped as usual.
export async function generateDraftNow(locationId: string) {
  const session = await auth()
  if (!session) redirect("/login")

  if (!isPro(session.user.stripePlan)) {
    return { error: "Manual schedule generation is a Pro feature." }
  }

  await inngest.send({
    name: "schedule/manual-generate",
    data: { locationId },
  })

  revalidatePath(`/dashboard/${locationId}`)
  return { ok: true }
}

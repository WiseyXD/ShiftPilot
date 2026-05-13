"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { generateToken } from "@/lib/tokens/generate"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import { revalidatePath } from "next/cache"
import * as React from "react"

type ActionState = { error: string } | null

export async function sendAvailabilitySetupEmail(employeeId: string) {
  const session = await auth()
  if (!session) return

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, location: { ownerId: session.user.id } },
    include: { location: true },
  })
  if (!employee) return

  const token = await generateToken(
    employeeId,
    "SUBMIT_AVAILABILITY",
    { locationId: employee.locationId },
    168 // 7 days
  )

  const url = `${process.env.NEXT_PUBLIC_APP_URL}/availability/${token.id}`

  await sendEmail({
    to: employee.email,
    subject: `Set your availability at ${employee.location.name}`,
    react: React.createElement(NotificationEmail, {
      heading: "Set your weekly availability",
      body: `Hi ${employee.name}, please set your regular availability for ${employee.location.name}. This helps us build fair, accurate schedules every week.`,
      ctaLabel: "Set my availability",
      ctaUrl: url,
    }),
  })

  revalidatePath(`/dashboard/${employee.locationId}`)
}

export async function submitRecurringAvailability(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tokenId = formData.get("tokenId") as string
  const employeeId = formData.get("employeeId") as string

  const token = await prisma.actionToken.findUnique({ where: { id: tokenId } })
  if (!token || token.usedAt || token.expiresAt < new Date()) {
    return { error: "This availability link has expired or already been used." }
  }
  if (token.employeeId !== employeeId) return { error: "Invalid token" }

  // slots is submitted as: "shiftTemplateId:dayOfWeek" pairs
  const slots = formData.getAll("slots") as string[]

  await prisma.$transaction([
    prisma.recurringAvailability.deleteMany({ where: { employeeId } }),
    ...slots.map((slot) => {
      const [shiftTemplateId, day] = slot.split(":")
      return prisma.recurringAvailability.create({
        data: { employeeId, shiftTemplateId, dayOfWeek: parseInt(day) },
      })
    }),
    prisma.actionToken.update({ where: { id: tokenId }, data: { usedAt: new Date() } }),
  ])

  return null
}

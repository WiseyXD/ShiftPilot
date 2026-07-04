"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { inngest } from "@/lib/inngest/client"
import { revalidatePath } from "next/cache"

export async function confirmSickCall(sickCallId: string) {
  const session = await auth()
  if (!session) return

  // Ownership + once-only, in one guarded write.
  const { count } = await prisma.sickCall.updateMany({
    where: { id: sickCallId, confirmedAt: null, location: { ownerId: session.user.id } },
    data: { confirmedAt: new Date() },
  })
  if (count === 0) return

  await inngest.send({ name: "sick/confirmed", data: { sickCallId } })
  const sickCall = await prisma.sickCall.findUnique({ where: { id: sickCallId } })
  if (sickCall) {
    await prisma.auditLog.create({
      data: {
        locationId: sickCall.locationId,
        action: "SICK_CALL_CONFIRMED",
        aiReasoning: "",
        candidatesConsidered: [],
        outcome: `Sick call ${sickCallId} confirmed via dashboard`,
      },
    })
    revalidatePath(`/dashboard/${sickCall.locationId}`)
  }
}

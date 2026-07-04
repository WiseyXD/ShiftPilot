"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { inngest } from "@/lib/inngest/client"
import { getShiftStart } from "@/lib/scheduling/shift-date"
import { isOnVacation } from "@/lib/scheduling/vacation"
import { revalidatePath } from "next/cache"

type VacationState = { error: string } | { warning: string } | null

export async function createVacation(
  _prev: VacationState,
  formData: FormData
): Promise<VacationState> {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }

  const locationId = formData.get("locationId") as string
  const location = await prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
  })
  if (!location) return { error: "Location not found" }

  const employeeId = formData.get("employeeId") as string
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, locationId } })
  if (!employee) return { error: "That employee doesn't belong to this location" }

  const startDate = new Date(`${formData.get("startDate")}T00:00:00Z`)
  const endDate = new Date(`${formData.get("endDate")}T00:00:00Z`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { error: "Both dates are required" }
  }
  if (endDate < startDate) return { error: "Vacation can't end before it starts" }

  const vacation = await prisma.vacation.create({
    data: { locationId, employeeId, startDate, endDate },
  })

  // Collisions: already-assigned shifts inside the range are flagged and sent
  // to the replacement engine; pins are reported so the manager can react.
  const shifts = await prisma.shift.findMany({
    where: {
      employeeId,
      status: { in: ["PENDING", "ACCEPTED", "REASSIGNED"] },
      schedule: { locationId },
    },
    include: { schedule: { select: { weekStart: true } }, shiftTemplate: { select: { startTime: true, name: true } } },
  })
  const range = [{ employeeId, startDate, endDate }]
  const colliding = shifts.filter((s) =>
    isOnVacation(range, employeeId, getShiftStart(new Date(s.schedule.weekStart), s.dayOfWeek, s.shiftTemplate.startTime))
  )
  for (const s of colliding) {
    await prisma.shift.update({ where: { id: s.id }, data: { status: "DECLINED" } })
    await inngest.send({ name: "shift/declined", data: { shiftId: s.id } })
  }

  const pinCount = await prisma.fixedShift.count({ where: { employeeId } })

  if (colliding.length > 0 || pinCount > 0) {
    await prisma.auditLog.create({
      data: {
        locationId,
        action: "VACATION_COLLISION",
        aiReasoning: `${employee.name} on vacation ${startDate.toISOString().slice(0, 10)}–${endDate.toISOString().slice(0, 10)}`,
        candidatesConsidered: colliding.map((s) => ({ shiftId: s.id })),
        outcome: `${colliding.length} shift(s) flagged for replacement; ${pinCount} pin(s) may be affected`,
      },
    })
    revalidatePath(`/dashboard/${locationId}/employees`)
    return {
      warning: `Vacation saved. ${colliding.length} assigned shift(s) were flagged and sent to the replacement engine${pinCount > 0 ? `; ${employee.name} also has ${pinCount} pinned shift(s) that may collide` : ""}.`,
    }
  }

  void vacation
  revalidatePath(`/dashboard/${locationId}/employees`)
  return null
}

export async function deleteVacation(id: string) {
  const session = await auth()
  if (!session) return
  await prisma.vacation.deleteMany({ where: { id, location: { ownerId: session.user.id } } })
}

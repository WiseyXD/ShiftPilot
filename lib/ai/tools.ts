import { prisma } from "@/prisma/client"
import { rescheduleWithAI } from "@/lib/llm/rescheduler"

export const tools = {
  async getSchedule(scheduleId: string) {
    return prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { shifts: true },
    })
  },

  async reschedule(scheduleId: string) {
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { shifts: true },
    })

    const employees = await prisma.employee.findMany({
      where: { cafeId: schedule!.cafeId },
      include: { availability: true },
    })

    const updates = await rescheduleWithAI({
      employees,
      shifts: schedule!.shifts,
    })

    for (const u of updates) {
      await prisma.shift.update({
        where: { id: u.shiftId },
        data: {
          employeeId: u.employeeId,
          status: u.employeeId ? "pending" : "unassigned",
        },
      })
    }

    return { success: true, updates }
  },

  async getStats(scheduleId: string) {
    const shifts = await prisma.shift.findMany({
      where: { scheduleId },
    })

    const stats: Record<string, any> = {}

    shifts.forEach((s) => {
      if (!s.employeeId) return

      if (!stats[s.employeeId]) {
        stats[s.employeeId] = {
          total: 0,
          pending: 0,
          accepted: 0,
        }
      }

      stats[s.employeeId].total++
      if (s.status === "pending") stats[s.employeeId].pending++
      if (s.status === "accepted") stats[s.employeeId].accepted++
    })

    return stats
  }
}

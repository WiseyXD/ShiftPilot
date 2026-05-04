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
  },

  async clearDay(scheduleId: string, day: string) {
    // day like "Monday", "Tuesday", etc.
    await prisma.shift.updateMany({
      where: {
        scheduleId,
        day: {
          equals: day,
          mode: 'insensitive' // case insensitive match
        }
      },
      data: {
        employeeId: null,
        status: "unassigned"
      }
    })
    return { success: true, message: `Cleared all shifts for ${day}` }
  },

  async approveAll(scheduleId: string) {
    await prisma.shift.updateMany({
      where: {
        scheduleId,
        status: "pending"
      },
      data: {
        status: "accepted"
      }
    })
    return { success: true, message: "All pending shifts have been approved" }
  },

  async assignSpecificShift(scheduleId: string, day: string, shiftBlock: string | null, employeeName: string) {
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId }
    })
    if (!schedule) throw new Error("Schedule not found")

    // Find the employee by name (case-insensitive approximation)
    const employees = await prisma.employee.findMany({
      where: { cafeId: schedule.cafeId }
    })
    
    const targetEmployee = employees.find(e => e.name.toLowerCase().includes(employeeName.toLowerCase()))
    if (!targetEmployee) {
      return { error: `Employee named ${employeeName} not found` }
    }

    // Build the query
    const whereClause: any = {
      scheduleId,
      day: { equals: day, mode: 'insensitive' }
    }
    
    if (shiftBlock && shiftBlock.toLowerCase() !== "all") {
      whereClause.shift = { equals: shiftBlock, mode: 'insensitive' }
    }

    await prisma.shift.updateMany({
      where: whereClause,
      data: {
        employeeId: targetEmployee.id,
        status: "pending"
      }
    })

    return { 
      success: true, 
      message: `Assigned ${day}${shiftBlock ? ' ' + shiftBlock : ''} shifts to ${targetEmployee.name}` 
    }
  }
}

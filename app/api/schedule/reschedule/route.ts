import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"
import { rescheduleWithAI } from "@/lib/llm/rescheduler"

export async function POST(req: Request) {
    const { scheduleId } = await req.json()

    const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        include: {
            shifts: {
                include: { employee: true },
            },
        },
    })

    const employees = await prisma.employee.findMany({
        where: { cafeId: schedule!.cafeId },
        include: { availability: true },
    })

    const declined = schedule!.shifts.filter(
        (s) => s.status === "declined"
    )

    if (declined.length === 0) {
        return NextResponse.json({ success: true, message: "No changes needed" })
    }

    const aiResult = await rescheduleWithAI({
        employees,
        shifts: schedule!.shifts,
    })

    for (const update of aiResult) {
        const employee = employees.find(
            (e) => e.name === update.employeeName
        )

        await prisma.shift.update({
            where: { id: update.shiftId },
            data: {
                employeeId: employee?.id || null,
                status: employee ? "pending" : "unassigned",
            },
        })
    }

    return NextResponse.json({ success: true })
}

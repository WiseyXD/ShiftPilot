import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"
import { rescheduleWithAI } from "@/lib/llm/rescheduler"
import { ShiftStatus } from "@/prisma/generated/client/enums"

export async function POST(req: Request) {
    try {
        const { scheduleId } = await req.json()

        const schedule = await prisma.schedule.findUnique({
            where: { id: scheduleId },
            include: {
                shifts: true,
            },
        })

        if (!schedule) {
            return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
        }

        const employees = await prisma.employee.findMany({
            where: { cafeId: schedule.cafeId },
            include: { availability: true },
        })

        const declined = schedule.shifts.filter(
            (s) => s.status === "declined"
        )

        if (declined.length === 0) {
            return NextResponse.json({ success: true, message: "No changes needed" })
        }

        const aiUpdates = await rescheduleWithAI({
            employees,
            shifts: schedule.shifts,
        })

        const updatesToApply = []

        for (const u of aiUpdates) {
            const shift = schedule.shifts.find((s) => s.id === u.shiftId)
            if (!shift) continue

            // 🔥 VALIDATION LAYER

            let validEmployeeId: string | null = null

            if (u.employeeId) {
                const emp = employees.find((e) => e.id === u.employeeId)

                if (emp) {
                    const isAvailable = emp.availability.some(
                        (a) => a.day === shift.day && a.shift === shift.shift
                    )

                    const alreadyAssigned = schedule.shifts.some(
                        (s) =>
                            s.employeeId === emp.id &&
                            s.day === shift.day &&
                            s.id !== shift.id
                    )

                    if (isAvailable && !alreadyAssigned) {
                        validEmployeeId = emp.id
                    }
                }
            }

            updatesToApply.push({
                shiftId: shift.id,
                employeeId: validEmployeeId,
                status: validEmployeeId ? "pending" : "unassigned",
                reason: u.reason,
            })
        }

        // 🔥 TRANSACTION
        await prisma.$transaction(
            updatesToApply.map((u) =>
                prisma.shift.update({
                    where: { id: u.shiftId },
                    data: {
                        employeeId: u.employeeId,
                        status: u.employeeId
                            ? ShiftStatus.pending
                            : ShiftStatus.unassigned,
                    }
                })
            )
        )

        // 🔥 LOOP DETECTION
        const unresolved = updatesToApply.filter(
            (u) => u.employeeId === null
        )

        return NextResponse.json({
            success: true,
            unresolvedCount: unresolved.length,
            updates: updatesToApply,
        })
    } catch (err) {
        console.error(err)
        return NextResponse.json(
            { error: "Rescheduling failed" },
            { status: 500 }
        )
    }
}

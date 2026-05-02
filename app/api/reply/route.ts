import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
    try {
        const { employeeId, shiftId, content } = await req.json()

        const targetShift = await prisma.shift.findUnique({
            where: { id: shiftId },
            include: { schedule: true },
        })

        if (!targetShift) {
            return NextResponse.json({ error: "Shift not found" }, { status: 404 })
        }

        // validate ownership
        if (targetShift.employeeId !== employeeId) {
            return NextResponse.json(
                { error: "You are not assigned to this shift" },
                { status: 400 }
            )
        }

        const { day, shift } = targetShift

        const candidates = await prisma.employee.findMany({
            where: {
                cafeId: targetShift.schedule.cafeId,
                id: { not: employeeId },
                availability: {
                    some: { day, shift },
                },
            },
            include: {
                shifts: {
                    where: {
                        scheduleId: targetShift.scheduleId,
                    },
                },
            },
        })

        if (candidates.length === 0) {
            return NextResponse.json(
                { error: "No available replacement found" },
                { status: 400 }
            )
        }

        const validCandidates = candidates.filter(
            (emp) =>
                !emp.shifts.some(
                    (s) => s.day === day || (s.day === day && s.shift === shift)
                )
        )

        if (validCandidates.length === 0) {
            return NextResponse.json(
                { error: "No valid replacement available" },
                { status: 400 }
            )
        }

        const replacement = validCandidates.reduce((prev, curr) =>
            prev.shifts.length <= curr.shifts.length ? prev : curr
        )

        const updatedShift = await prisma.shift.update({
            where: { id: targetShift.id },
            data: {
                employeeId: replacement.id,
                status: "swapped",
            },
            include: { employee: true },
        });

        return NextResponse.json({
            success: true,
            updatedShift,
        })

    } catch (err) {
        console.error(err)
        return NextResponse.json(
            { error: "Failed to process reply" },
            { status: 500 }
        )
    }
}

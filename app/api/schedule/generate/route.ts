import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"
import { generateScheduleWithAI } from "@/lib/llm/scheduler"

export async function POST(req: Request) {
    try {
        const { cafeId, weekStart } = await req.json()

        const employees = await prisma.employee.findMany({
            where: { cafeId },
        })

        if (employees.length === 0) {
            return NextResponse.json({ error: "No employees" }, { status: 400 })
        }

        // 🧠 AI generates schedule
        const aiShifts = await generateScheduleWithAI(
            employees.map((e) => ({ name: e.name }))
        )

        // create schedule
        const schedule = await prisma.schedule.create({
            data: {
                cafeId,
                weekStart: new Date(weekStart),
            },
        })

        // map names → employee IDs
        const shiftsData = aiShifts.map((s) => {
            const employee = employees.find((e) => e.name === s.employeeName)

            return {
                scheduleId: schedule.id,
                employeeId: employee?.id || null,
                day: s.day,
                shift: s.shift,
            }
        })

        await prisma.shift.createMany({
            data: shiftsData,
        })

        const fullSchedule = await prisma.schedule.findUnique({
            where: { id: schedule.id },
            include: {
                shifts: {
                    include: { employee: true },
                },
            },
        })

        return NextResponse.json(fullSchedule)
    } catch (err) {
        console.error(err)
        return NextResponse.json(
            { error: "Failed to generate schedule" },
            { status: 500 }
        )
    }
}

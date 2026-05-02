import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"
import { generateScheduleWithAI } from "@/lib/llm/scheduler"

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
const SHIFTS = ["morning", "evening"]

export async function POST(req: Request) {
    try {
        const { cafeId, weekStart } = await req.json()

        const employees = await prisma.employee.findMany({
            where: { cafeId },
            include: { availability: true },
        })

        if (employees.length === 0) {
            return NextResponse.json({ error: "No employees" }, { status: 400 })
        }

        let aiShifts

        try {
            aiShifts = await generateScheduleWithAI(
                employees.map((e) => ({
                    name: e.name,
                    availability: e.availability,
                }))
            )

            // ✅ VALIDATION
            if (aiShifts.length !== DAYS.length * SHIFTS.length) {
                throw new Error("Invalid AI output")
            }

            for (const s of aiShifts) {
                if (!DAYS.includes(s.day) || !SHIFTS.includes(s.shift)) {
                    throw new Error("Invalid shift format")
                }
            }
        } catch {
            // 🔥 FALLBACK
            aiShifts = []

            let index = 0
            for (const day of DAYS) {
                for (const shift of SHIFTS) {
                    const emp = employees[index % employees.length]

                    aiShifts.push({
                        day,
                        shift,
                        employeeName: emp.name,
                    })

                    index++
                }
            }
        }

        const schedule = await prisma.schedule.create({
            data: {
                cafeId,
                weekStart: new Date(weekStart),
            },
        })

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

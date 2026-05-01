
import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
const SHIFTS = ["morning", "evening"]

export async function POST(req: Request) {
    try {
        const { cafeId, weekStart } = await req.json()

        const employees = await prisma.employee.findMany({
            where: { cafeId },
            include: { availability: true },
        })

        const schedule = await prisma.schedule.create({
            data: {
                cafeId,
                weekStart: new Date(weekStart),
            },
        })

        const shiftsData = []

        for (const day of DAYS) {
            for (const shift of SHIFTS) {
                // find available employees
                const available = employees.filter((e) =>
                    e.availability.some(
                        (a) => a.day === day && a.shift === shift
                    )
                )

                const assigned = available[Math.floor(Math.random() * available.length)]

                shiftsData.push({
                    scheduleId: schedule.id,
                    employeeId: assigned?.id || null,
                    day,
                    shift,
                })
            }
        }

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
        return NextResponse.json({ error: "Failed to generate schedule" }, { status: 500 })
    }
}

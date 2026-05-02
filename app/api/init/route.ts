import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"

export async function GET() {
    try {
        const cafe = await prisma.cafe.findFirst()

        if (!cafe) {
            return NextResponse.json({
                cafe: null,
                employees: [],
                schedule: null,
            })
        }

        const employees = await prisma.employee.findMany({
            where: { cafeId: cafe.id },
        })

        const schedule = await prisma.schedule.findFirst({
            where: { cafeId: cafe.id },
            include: {
                shifts: {
                    include: { employee: true },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        })

        return NextResponse.json({
            cafe,
            employees,
            schedule,
        })
    } catch (err) {
        console.error(err)
        return NextResponse.json(
            { error: "Failed to load data" },
            { status: 500 }
        )
    }
}

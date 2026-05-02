import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = await params
        const schedule = await prisma.schedule.findUnique({
            where: {
                id: id,
            },
            include: {
                shifts: {
                    include: {
                        employee: true,
                    },
                    orderBy: [
                        { day: "asc" },
                        { shift: "asc" },
                    ],
                },
            },
        })

        if (!schedule) {
            return NextResponse.json(
                { error: "Schedule not found" },
                { status: 404 }
            )
        }

        return NextResponse.json(schedule)
    } catch (err) {
        console.error(err)
        return NextResponse.json(
            { error: "Failed to fetch schedule" },
            { status: 500 }
        )
    }
}

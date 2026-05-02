import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"

export async function POST() {
    try {
        // 🔥 delete in correct order (important)
        await prisma.shift.deleteMany()
        await prisma.schedule.deleteMany()
        await prisma.availability.deleteMany()
        await prisma.employee.deleteMany()
        await prisma.cafe.deleteMany()

        return NextResponse.json({
            success: true,
        })
    } catch (err) {
        console.error(err)
        return NextResponse.json(
            { error: "Reset failed" },
            { status: 500 }
        )
    }
}

import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
    try {
        const { employeeId, shiftId, content } = await req.json()


        await prisma.shift.update({
            where: { id: shiftId },
            data: {
                status: "declined", // or accepted
            },
        })

        return NextResponse.json({
            success: true,
        })

    } catch (err) {
        console.error(err)
        return NextResponse.json(
            { error: "Failed to process reply" },
            { status: 500 }
        )
    }
}

import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
    try {
        const { employeeId, cafeId, content } = await req.json()

        const message = await prisma.message.create({
            data: {
                employeeId,
                cafeId,
                content,
                role: "employee",
            },
        })

        return NextResponse.json(message)
    } catch {
        return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
    }
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const employeeId = searchParams.get("employeeId")

    const messages = await prisma.message.findMany({
        where: { employeeId: employeeId || undefined },
        orderBy: { createdAt: "asc" },
    })

    return NextResponse.json(messages)
}

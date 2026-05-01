import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
    try {
        const { name, email, cafeId, availability } = await req.json()

        if (!name || !email || !cafeId) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 })
        }

        const employee = await prisma.employee.create({
            data: {
                name,
                email,
                cafeId,
                availability: {
                    create: availability || [],
                },
            },
            include: {
                availability: true,
            },
        })

        return NextResponse.json(employee)
    } catch (err) {
        return NextResponse.json({ error: "Failed to create employee" }, { status: 500 })
    }
}

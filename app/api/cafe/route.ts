import { NextResponse } from "next/server"
import { prisma } from "@/prisma/client"
export async function POST(req: Request) {
    try {
        const { name, email } = await req.json()

        if (!name) {
            return NextResponse.json({ error: "Name required" }, { status: 400 })
        }

        const cafe = await prisma.cafe.create({
            data: {
                name,
                email,
            },
        })

        return NextResponse.json(cafe)
    } catch (err) {
        return NextResponse.json({ error: "Failed to create cafe" }, { status: 500 })
    }
}

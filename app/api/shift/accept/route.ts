import { NextResponse } from "next/server"

import { prisma } from "@/prisma/client"

export async function POST(req: Request) {
    const { shiftId } = await req.json()

    const updated = await prisma.shift.update({
        where: { id: shiftId },
        data: { status: "accepted" },
    })

    return NextResponse.json({ success: true, updated })
}

import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"
import { parseMessageWithLLM } from "@/lib/llm/parser"

export async function POST(req: Request) {
    try {
        const { employeeId, content } = await req.json()

        if (!employeeId || !content) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 })
        }

        // 🧠 1. LLM parsing
        const parsed = await parseMessageWithLLM(content)

        if (!parsed.day || !parsed.shift) {
            return NextResponse.json({
                message: "Could not understand request",
            })
        }

        const { day, shift } = parsed

        // 🔍 2. Find shift
        const targetShift = await prisma.shift.findFirst({
            where: {
                employeeId,
                day,
                shift,
            },
            include: {
                schedule: true,
            },
        })

        if (!targetShift) {
            return NextResponse.json({ error: "Shift not found" }, { status: 404 })
        }

        // 🔄 3. Find replacement
        const candidates = await prisma.employee.findMany({
            where: {
                cafeId: targetShift.schedule.cafeId,
                id: { not: employeeId },
                availability: {
                    some: { day, shift },
                },
            },
        })

        const replacement = candidates[0]

        const updatedShift = await prisma.shift.update({
            where: { id: targetShift.id },
            data: {
                employeeId: replacement?.id || null,
                status: "swapped",
            },
            include: { employee: true },
        })

        return NextResponse.json({
            success: true,
            parsed,
            updatedShift,
        })
    } catch (err) {
        console.error(err)
        return NextResponse.json(
            { error: "Failed to process reply" },
            { status: 500 }
        )
    }
}

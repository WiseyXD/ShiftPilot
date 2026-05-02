import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"
import { parseMessageWithLLM } from "@/lib/llm/parser"

export async function POST(req: Request) {
    try {
        const { employeeId, content } = await req.json()

        const parsed = await parseMessageWithLLM(content)

        console.log("parsed", parsed)

        if (!parsed.day || !parsed.shift) {
            return NextResponse.json({
                message: "Could not understand request",
            })
        }

        const day =
            parsed.day.charAt(0).toUpperCase() +
            parsed.day.slice(1).toLowerCase()

        const shift = parsed.shift.toLowerCase()

        const targetShift = await prisma.shift.findFirst({
            where: {
                day,
                shift,
                employeeId, // 🔥 CRITICAL FIX
            },
            include: {
                schedule: true,
            },
        })

        if (!targetShift) {
            return NextResponse.json({ error: "Shift not found" }, { status: 404 })
        }


        // 🔥 validate employee
        if (targetShift.employeeId !== employeeId) {
            return NextResponse.json(
                { error: "You are not assigned to this shift" },
                { status: 400 }
            )
        }

        const candidates = await prisma.employee.findMany({
            where: {
                cafeId: targetShift.schedule.cafeId,
                id: { not: employeeId },
                availability: {
                    some: {
                        day,
                        shift,
                    },
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

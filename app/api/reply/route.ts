import { prisma } from "@/prisma/client"
import { NextResponse } from "next/server"

// 🔹 Simple parser (replace with LLM later)
function parseMessage(content: string) {
    const text = content.toLowerCase()

    let day: string | null = null
    let shift: string | null = null

    const days = ["monday", "tuesday", "wednesday", "thursday", "friday"]
    const shifts = ["morning", "evening"]

    for (const d of days) {
        if (text.includes(d)) {
            day = d.charAt(0).toUpperCase() + d.slice(1)
        }
    }

    for (const s of shifts) {
        if (text.includes(s)) {
            shift = s
        }
    }

    if (text.includes("can't") || text.includes("cannot") || text.includes("not available")) {
        return {
            intent: "unavailable",
            day,
            shift,
        }
    }

    return null
}

export async function POST(req: Request) {
    try {
        const { employeeId, content } = await req.json()

        if (!employeeId || !content) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 })
        }

        // 1️⃣ Parse message
        const parsed = parseMessage(content)

        if (!parsed || !parsed.day || !parsed.shift) {
            return NextResponse.json({
                message: "Could not understand request",
            })
        }

        const { day, shift } = parsed

        // 2️⃣ Find shift
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

        // 3️⃣ Find replacement
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

        // naive pick (can improve later)
        const replacement = candidates[0]

        // 4️⃣ Update shift
        const updatedShift = await prisma.shift.update({
            where: { id: targetShift.id },
            data: {
                employeeId: replacement?.id || null,
                status: "swapped",
            },
            include: {
                employee: true,
            },
        })

        // 5️⃣ Save system message (optional but useful)
        await prisma.message.create({
            data: {
                employeeId,
                cafeId: targetShift.schedule.cafeId,
                content: `Shift updated: ${day} ${shift} reassigned.`,
                role: "system",
            },
        })

        return NextResponse.json({
            success: true,
            updatedShift,
        })
    } catch (err) {
        return NextResponse.json(
            { error: "Failed to process reply" },
            { status: 500 }
        )
    }
}

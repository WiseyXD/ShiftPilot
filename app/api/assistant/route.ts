import { NextResponse } from "next/server"
import { ChatOpenAI } from "@langchain/openai"
import { prisma } from "@/prisma/client"
import { z } from "zod"

const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0,
})

const decisionSchema = z.object({
    message: z.string().describe("Your friendly conversational reply to the user"),
    modifications: z.array(
        z.object({
            shiftId: z.string(),
            employeeId: z.string().nullable(),
            status: z.enum(["pending", "accepted", "declined", "unassigned"])
        })
    ).describe("A list of explicit database modifications to make to the schedule. If you are just answering a question without making changes, leave this array empty.")
})

export async function POST(req: Request) {
    try {
        const { messages, scheduleId } = await req.json()
        
        // Fetch current context
        let scheduleContext = ""
        let employeeContext = ""

        if (scheduleId) {
            const schedule = await prisma.schedule.findUnique({
                where: { id: scheduleId },
                include: { shifts: true }
            })

            if (schedule) {
                const employees = await prisma.employee.findMany({
                    where: { cafeId: schedule.cafeId },
                    include: { availability: true }
                })

                employeeContext = employees.map((e) => 
                    `${e.id}: ${e.name} → Available for: ${e.availability.map(a => `${a.day}-${a.shift}`).join(", ")}`
                ).join("\n")

                scheduleContext = schedule.shifts.map((s) => {
                    const empName = s.employeeId ? employees.find(e => e.id === s.employeeId)?.name : "Nobody"
                    return `${s.id}: ${s.day}-${s.shift} (${s.status}) assigned to ${empName} (ID: ${s.employeeId})`
                }).join("\n")
            }
        }

        const prompt = `
You are a brilliant, highly capable scheduling assistant. You have DIRECT read/write access to the schedule database.
Your job is to read the user's request, examine the CURRENT SCHEDULE and EMPLOYEE AVAILABILITY, and emit precise database modifications to satisfy the request.

CURRENT SCHEDULE:
${scheduleContext || "No schedule available."}

EMPLOYEES & AVAILABILITY:
${employeeContext || "No employees available."}

CHAT HISTORY:
${messages.map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join("\n")}

INSTRUCTIONS:
1. If the user asks you to clear a day, find all shiftIds for that day in the CURRENT SCHEDULE, and emit a modification for each setting employeeId to null and status to "unassigned".
2. If the user asks you to swap shifts, find who has what shiftId, and emit modifications swapping their employeeIds.
3. If the user asks to assign all shifts to a specific person, find all shiftIds and set employeeId to that person's ID.
4. If an employee is on vacation, find all their shiftIds and reassign them to other available employees based on EMPLOYEES & AVAILABILITY.
5. Provide a friendly \`message\` confirming what you did.
`

        const structured = model.withStructuredOutput(decisionSchema)
        const parsed = await structured.invoke(prompt)

        // Execute modifications
        if (parsed.modifications && parsed.modifications.length > 0) {
            await prisma.$transaction(
                parsed.modifications.map((mod) => 
                    prisma.shift.update({
                        where: { id: mod.shiftId },
                        data: {
                            employeeId: mod.employeeId,
                            status: mod.status
                        }
                    })
                )
            )
        }

        return NextResponse.json({
            action: parsed.modifications.length > 0 ? "modified" : "none",
            response: parsed.message,
        })
    } catch (err) {
        console.error(err)
        return NextResponse.json(
            { error: "Assistant failed" },
            { status: 500 }
        )
    }
}

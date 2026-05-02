import { NextResponse } from "next/server"
import { ChatOpenAI } from "@langchain/openai"
import { tools } from "@/lib/ai/tools"

const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0,
})

export async function POST(req: Request) {
    try {
        const { message, scheduleId } = await req.json()

        const prompt = `
You are a scheduling assistant.

Decide which action to take:

Available tools:
1. getSchedule
2. reschedule
3. getStats

Rules:
- If user asks to fix/reassign → use reschedule
- If user asks about workload → use getStats
- If user asks to view schedule → use getSchedule

Return JSON:
{
  "tool": "...",
  "args": { ... }
}

User message:
${message}
`

        const decision = await model.invoke(prompt)

        let parsed
        try {
            parsed = JSON.parse(decision.content as string)
        } catch {
            return NextResponse.json({
                response: "Could not understand request",
            })
        }

        let result

        switch (parsed.tool) {
            case "reschedule":
                result = await tools.reschedule(scheduleId)
                break

            case "getSchedule":
                result = await tools.getSchedule(scheduleId)
                break

            case "getStats":
                result = await tools.getStats(scheduleId)
                break

            default:
                return NextResponse.json({
                    response: "I couldn't understand what to do.",
                })
        }

        // 🔥 SECOND LLM CALL → convert result to human response

        const finalResponse = await model.invoke(`
You are a precise system assistant.

Rules:
- Answer ONLY using the given JSON data
- Do NOT infer, assume, or guess
- Do NOT mention tools or implementation
- Do NOT explain how you got the answer
- Keep answer under 2 sentences
- If unsure → say: "I don't have enough information"

User:
"${message}"

Data:
${JSON.stringify(result)}

Answer:
`)
        return NextResponse.json({
            action: parsed.tool,
            response: finalResponse.content, // ✅ THIS is what UI should show
        })
    } catch (err) {
        console.error(err)
        return NextResponse.json(
            { error: "Assistant failed" },
            { status: 500 }
        )
    }
}

import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"

const model = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.2,
})

const schema = z.object({
  updates: z.array(
    z.object({
      shiftId: z.string(),
      employeeId: z.string().nullable(),
      reason: z.string(),
    })
  ),
})

export async function rescheduleWithAI(input: {
  employees: any[]
  shifts: any[]
}) {
  const structured = model.withStructuredOutput(schema)

  const promptStr = `
You are a scheduling AI.

Goal:
Reassign ONLY declined shifts.

Rules:
- Use employeeId ONLY (never names)
- Respect availability strictly
- Balance workload
- DO NOT assign a declined shift to the employee who declined it
- If no valid employee → return null employeeId
- Always include reason

Employees:
${input.employees
      .map(
        (e) =>
          `${e.id}: ${e.name} → ${e.availability
            .map((a: any) => `${a.day}-${a.shift}`)
            .join(", ")}`
      )
      .join("\n")}

Shifts:
${input.shifts
      .map(
        (s) =>
          `${s.id}: ${s.day}-${s.shift} (${s.status}) assigned to ${s.employeeId}`
      )
      .join("\n")}

Return JSON only.
`

  const result = await structured.invoke(promptStr)

  return result.updates
}

import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"

const model = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.3,
})

const schema = z.object({
  shifts: z.array(
    z.object({
      shiftId: z.string(),
      employeeName: z.string().nullable(),
    })
  ),
})

export async function rescheduleWithAI(input: {
  employees: any[]
  shifts: any[]
}) {
  const structured = model.withStructuredOutput(schema)

  const result = await structured.invoke(`
You are a scheduling assistant.

Goal:
Reassign ONLY declined shifts.

Rules:
- Respect availability
- Avoid double booking
- Balance workload
- If no one available → assign null

Employees:
${input.employees
      .map(
        (e) =>
          `${e.name}: ${e.availability
            .map((a: any) => `${a.day}-${a.shift}`)
            .join(", ")}`
      )
      .join("\n")}

Shifts:
${input.shifts
      .map(
        (s) =>
          `${s.id}: ${s.day}-${s.shift} (${s.status}) assigned to ${s.employee?.name}`
      )
      .join("\n")}

Return updated assignments only for declined shifts.
`)

  return result.shifts
}

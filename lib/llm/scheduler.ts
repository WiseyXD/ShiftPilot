import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"

const model = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.3,
})

const scheduleSchema = z.object({
  shifts: z.array(
    z.object({
      day: z.string(),
      shift: z.string(),
      employeeName: z.string().nullable(),
    })
  ),
})

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
const SHIFTS = ["morning", "evening"]

export async function generateScheduleWithAI(employees: { name: string }[]) {
  const structuredModel = model.withStructuredOutput(scheduleSchema)

  const result = await structuredModel.invoke(`
You are a staff scheduler for a cafe.

Rules:
- Each day has 2 shifts: morning and evening
- Assign employees fairly
- Avoid assigning the same person repeatedly
- Use only given employee names

Employees:
${employees.map((e) => e.name).join(", ")}

Generate schedule for:
Days: ${DAYS.join(", ")}
Shifts: ${SHIFTS.join(", ")}

Return structured JSON.
`)

  return result.shifts
}

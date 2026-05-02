
import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"

const model = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
})

const schema = z.object({
  intent: z.enum(["unavailable", "swap", "other"]),
  day: z.string().nullable(),
  shift: z.string().nullable(),
})

export async function parseMessageWithLLM(message: string) {
  console.log("llm message sent", message)
  const structuredModel = model.withStructuredOutput(schema)

  const result = await structuredModel.invoke(
    `Extract scheduling intent from this message: ${message}`
  )

  return result
}

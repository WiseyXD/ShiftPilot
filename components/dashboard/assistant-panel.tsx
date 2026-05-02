"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function AssistantPanel({ schedule }: any) {
    const [input, setInput] = useState("")
    const [messages, setMessages] = useState<string[]>([])

    const send = async () => {
        if (!input) return

        const res = await fetch("/api/assistant", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message: input,
                scheduleId: schedule?.id,
            }),
        })

        const data = await res.json()

        setMessages((prev) => [
            ...prev,
            `You: ${input}`,
            `AI: ${data.response}`, // ✅ FIXED
        ])

        // 🔥 auto refresh if rescheduled
        if (data.action === "reschedule") {
            await fetchSchedule()
        }

        setInput("")
    }
    const fetchSchedule = async () => {
        if (!schedule?.id) return

        const res = await fetch(`/api/schedule/${schedule.id}`)
        const data = await res.json()
        // setSchedule(data)
    }


    return (
        <div className="flex flex-col h-full p-4">
            <div className="flex-1 space-y-2 overflow-y-auto">
                {messages.map((m, i) => (
                    <div key={i} className="text-sm">
                        {m}
                    </div>
                ))}
            </div>

            <div className="flex gap-2 mt-4">
                <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about schedule..."
                />
                <Button onClick={send}>Send</Button>
            </div>
        </div>
    )
}

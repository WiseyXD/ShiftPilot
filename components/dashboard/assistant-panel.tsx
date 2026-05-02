"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { BlurFade } from "@/components/ui/blur-fade"

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
        <div className="flex flex-col h-full p-4 bg-white/50 backdrop-blur-sm rounded-xl border shadow-sm">
            <h3 className="text-lg font-semibold mb-4">AI Assistant</h3>
            <div className="flex-1 space-y-3 overflow-y-auto pr-2">
                {messages.map((m, i) => (
                    <BlurFade key={i} delay={0.1}>
                        <div className="text-sm p-3 rounded-lg bg-white shadow-sm border text-slate-700">
                            {m}
                        </div>
                    </BlurFade>
                ))}
            </div>

            <div className="flex gap-2 mt-4">
                <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about schedule..."
                    className="bg-white"
                />
                <Button onClick={send}>Send</Button>
            </div>
        </div>
    )
}

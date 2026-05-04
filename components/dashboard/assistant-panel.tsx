"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { BlurFade } from "@/components/ui/blur-fade"

export function AssistantPanel({ schedule }: any) {
    const [input, setInput] = useState("")
    const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([])

    const send = async () => {
        if (!input) return

        const userMessage = { role: "user" as const, content: input }
        const newMessages = [...messages, userMessage]
        
        setMessages(newMessages)
        setInput("")

        const res = await fetch("/api/assistant", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messages: newMessages,
                scheduleId: schedule?.id,
            }),
        })

        const data = await res.json()

        setMessages((prev) => [
            ...prev,
            { role: "assistant", content: data.response },
        ])

        // 🔥 auto refresh if an action occurred
        if (data.action && data.action !== "none") {
            await fetchSchedule()
        }
    }
    const fetchSchedule = async () => {
        if (!schedule?.id) return

        const res = await fetch(`/api/schedule/${schedule.id}`)
        const data = await res.json()
        // Wait, where is setSchedule? It's not passed. 
        // We need to trigger a re-fetch. We can reload the window or dispatch an event, but AssistantPanel is already calling fetchSchedule which does nothing if setSchedule is missing.
        // Actually, we can dispatch a custom event that `app/page.tsx` listens to.
        window.dispatchEvent(new Event("schedule-updated"))
    }


    return (
        <div className="flex flex-col h-full p-4 bg-white/50 backdrop-blur-sm rounded-xl border shadow-sm">
            <h3 className="text-lg font-semibold mb-4">AI Assistant</h3>
            <div className="flex-1 space-y-3 overflow-y-auto pr-2">
                {messages.map((m, i) => (
                    <BlurFade key={i} delay={0.1}>
                        <div className={`text-sm p-3 rounded-lg shadow-sm border ${m.role === "user" ? "bg-slate-900 text-white ml-auto max-w-[80%]" : "bg-white text-slate-700 mr-auto max-w-[90%]"}`}>
                            <span className="font-semibold block mb-1">{m.role === "user" ? "You" : "AI"}</span>
                            {m.content}
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

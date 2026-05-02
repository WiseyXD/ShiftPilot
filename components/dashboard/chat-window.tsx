"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useState } from "react"

export function ChatWindows({
    activeChats,
    employees,
    schedule,
    messages,
    setMessages,
    sendMessage,
    toggleChat,
}: any) {
    const [selectedShift, setSelectedShift] = useState<any>({})

    return (
        <div className="fixed bottom-4 right-4 flex gap-3">
            {activeChats.map((id: string) => {
                const emp = employees.find((e: any) => e.id === id)

                // 🔥 get employee shifts
                const empShifts =
                    schedule?.shifts?.filter((s: any) => s.employeeId === id) || []

                return (
                    <div
                        key={id}
                        className="w-72 bg-white border rounded-xl shadow-lg flex flex-col"
                    >
                        <div className="px-3 py-2 border-b flex justify-between">
                            <span className="text-sm font-medium">{emp?.name}</span>
                            <button onClick={() => toggleChat(id)}>✕</button>
                        </div>

                        <div className="p-3 space-y-2">
                            {/* 🔥 shift selector */}
                            <select
                                className="w-full border rounded p-2 text-sm"
                                onChange={(e) =>
                                    setSelectedShift((prev: any) => ({
                                        ...prev,
                                        [id]: e.target.value,
                                    }))
                                }
                            >
                                <option value="">Select shift</option>
                                {empShifts.map((s: any) => (
                                    <option key={s.id} value={s.id}>
                                        {s.day} - {s.shift}
                                    </option>
                                ))}
                            </select>

                            <Input
                                placeholder="Type message..."
                                value={messages[id] || ""}
                                onChange={(e) =>
                                    setMessages((prev: any) => ({
                                        ...prev,
                                        [id]: e.target.value,
                                    }))
                                }
                            />

                            <Button
                                className="w-full"
                                size="sm"
                                onClick={() =>
                                    sendMessage(id, selectedShift[id]) // 🔥 pass shiftId
                                }
                            >
                                Send
                            </Button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

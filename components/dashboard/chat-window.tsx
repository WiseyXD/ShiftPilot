"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function ChatWindows({
    activeChats,
    employees,
    messages,
    setMessages,
    sendMessage,
    toggleChat,
}: any) {
    return (
        <div className="fixed bottom-4 right-4 flex gap-3">
            {activeChats.map((id: string) => {
                const emp = employees.find((e: any) => e.id === id)

                return (
                    <div
                        key={id}
                        className="w-72 bg-white border rounded-xl shadow-lg flex flex-col"
                    >
                        <div className="px-3 py-2 border-b flex justify-between">
                            <span className="text-sm font-medium">{emp?.name}</span>
                            <button onClick={() => toggleChat(id)}>✕</button>
                        </div>

                        <div className="p-3">
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
                                className="mt-2 w-full"
                                size="sm"
                                onClick={() => sendMessage(id)}
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

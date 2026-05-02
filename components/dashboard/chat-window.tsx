"use client"

import { Button } from "@/components/ui/button"
import { BorderBeam } from "@/components/ui/border-beam"

export function ChatWindows({
    activeChats,
    employees,
    schedule,
    toggleChat,
    onAcceptShift,
    onDeclineShift,
}: any) {
    return (
        <div className="fixed bottom-4 right-4 flex gap-3 z-50">
            {activeChats.map((id: string) => {
                const emp = employees.find((e: any) => e.id === id)

                const empShifts =
                    schedule?.shifts?.filter(
                        (s: any) => s.employeeId === id && s.status === "pending"
                    ) || []

                return (
                    <div
                        key={id}
                        className="w-80 bg-white border rounded-xl shadow-2xl flex flex-col relative overflow-hidden"
                    >
                        <BorderBeam duration={8} size={100} />
                        {/* Header */}
                        <div className="px-3 py-2 border-b flex justify-between">
                            <span className="text-sm font-medium">{emp?.name}</span>
                            <button onClick={() => toggleChat(id)}>✕</button>
                        </div>

                        {/* Content */}
                        <div className="p-3 space-y-3">
                            {empShifts.length === 0 ? (
                                <div className="text-sm text-muted-foreground">
                                    No pending shifts 🎉
                                </div>
                            ) : (
                                <>
                                    <div className="text-sm">
                                        You have been assigned:
                                    </div>

                                    {empShifts.map((s: any) => (
                                        <div
                                            key={s.id}
                                            className="border rounded-md p-2 flex justify-between items-center"
                                        >
                                            <span className="text-xs">
                                                {s.day} - {s.shift}
                                            </span>

                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => onAcceptShift(s)}
                                                >
                                                    Accept
                                                </Button>

                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => onDeclineShift(s)}
                                                >
                                                    Decline
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

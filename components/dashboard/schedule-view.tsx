"use client"

import { Button } from "@/components/ui/button"

export function ScheduleView({
    schedule,
    onAccept,
    onDecline,
}: any) {
    if (!schedule) return null

    return (
        <div className="space-y-3">
            {schedule.shifts.map((s: any) => (
                <div
                    key={s.id}
                    className="flex justify-between items-center border rounded-lg px-4 py-3 bg-white"
                >
                    <div>
                        <div className="text-sm font-medium">
                            {s.day} - {s.shift}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {s.employee?.name || "Unassigned"}
                        </div>
                        <div className="text-xs mt-1">
                            Status: {s.status}
                        </div>
                    </div>

                </div>
            ))}
        </div>
    )
}

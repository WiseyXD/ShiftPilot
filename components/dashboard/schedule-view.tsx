"use client"

import { Button } from "@/components/ui/button"

export function ScheduleView({ schedule, onDecline }: any) {
    if (!schedule) return null

    return (
        <div className="space-y-3">
            {schedule.shifts.map((s: any) => (
                <div
                    key={s.id}
                    className="flex justify-between items-center border rounded-lg px-4 py-3 bg-white shadow-sm"
                >
                    <div>
                        <div className="text-sm font-medium">
                            {s.day} - {s.shift}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {s.employee?.name || "Unassigned"}
                        </div>
                    </div>

                    {s.employee && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onDecline(s)}
                        >
                            Decline
                        </Button>
                    )}
                </div>
            ))}
        </div>
    )
}

"use client"

import { AnimatedList } from "@/components/ui/animated-list"

export function ScheduleView({
    schedule,
    onAccept,
    onDecline,
}: any) {
    if (!schedule) return null

    return (
        <div className="relative flex min-h-[300px] max-h-[500px] w-full flex-col overflow-hidden rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Generated Schedule</h3>
            <div className="flex-1 overflow-y-auto pr-2">
                <AnimatedList delay={100} className="space-y-3">
                    {schedule.shifts.map((s: any) => (
                        <div
                            key={s.id}
                            className="flex justify-between items-center border rounded-lg px-4 py-3 bg-slate-50 transition-all hover:bg-slate-100"
                        >
                            <div>
                                <div className="text-sm font-medium">
                                    {s.day} - {s.shift}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    {s.employee?.name || "Unassigned"}
                                </div>
                                <div className="text-xs mt-1 px-2 py-0.5 rounded-full bg-slate-200 inline-block">
                                    {s.status}
                                </div>
                            </div>
                        </div>
                    ))}
                </AnimatedList>
            </div>
        </div>
    )
}

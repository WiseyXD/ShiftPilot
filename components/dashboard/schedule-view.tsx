"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function ScheduleView({ schedule }: any) {
    if (!schedule) return null

    return (
        <Card>
            <CardHeader>
                <CardTitle>Schedule</CardTitle>
            </CardHeader>
            <CardContent>
                {schedule.shifts.map((s: any) => (
                    <div key={s.id} className="text-sm">
                        {s.day} - {s.shift} → {s.employee?.name || "Unassigned"}
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

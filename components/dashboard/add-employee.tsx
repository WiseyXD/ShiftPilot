"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
const SHIFTS = ["morning", "evening"]

export function AddEmployee({ form, onSubmit }: any) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Add Employee</CardTitle>
            </CardHeader>

            <CardContent>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="flex gap-3">
                        <Input placeholder="Name" {...form.register("name")} />
                        <Input placeholder="Email" {...form.register("email")} />
                        <Button>Add</Button>
                    </div>

                    {/* ✅ Availability */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        {DAYS.map((day) =>
                            SHIFTS.map((shift) => {
                                const value = `${day}-${shift}`

                                return (
                                    <label key={value} className="flex gap-2">
                                        <input
                                            type="checkbox"
                                            value={value}
                                            {...form.register("availability")}
                                        />
                                        {day} {shift}
                                    </label>
                                )
                            })
                        )}
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}

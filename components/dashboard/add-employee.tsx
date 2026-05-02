"use client"

import { MagicCard } from "@/components/ui/magic-card"
import { ShimmerButton } from "@/components/ui/shimmer-button"
import { Input } from "@/components/ui/input"

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
const SHIFTS = ["morning", "evening"]

export function AddEmployee({ form, onSubmit }: any) {
    return (
        <MagicCard className="w-full flex-col items-start justify-center overflow-hidden border shadow-sm">
            <div className="p-6 pb-2">
                <h3 className="text-xl font-semibold leading-none tracking-tight">Add Employee</h3>
            </div>

            <div className="p-6 pt-0 w-full">
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="flex gap-3">
                        <Input placeholder="Name" {...form.register("name")} className="bg-white" />
                        <Input placeholder="Email" {...form.register("email")} className="bg-white" />
                        <ShimmerButton type="submit" className="h-10 px-6 shadow-2xl">
                            <span className="whitespace-pre-wrap text-center text-sm font-medium leading-none tracking-tight text-white dark:from-white dark:to-slate-900/10 lg:text-sm">
                                Add
                            </span>
                        </ShimmerButton>
                    </div>

                    {/* ✅ Availability */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        {DAYS.map((day) =>
                            SHIFTS.map((shift) => {
                                const value = `${day}-${shift}`

                                return (
                                    <label key={value} className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            value={value}
                                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                            {...form.register("availability")}
                                        />
                                        <span className="capitalize">{day} {shift}</span>
                                    </label>
                                )
                            })
                        )}
                    </div>
                </form>
            </div>
        </MagicCard>
    )
}

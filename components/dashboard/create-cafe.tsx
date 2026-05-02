"use client"

import { MagicCard } from "@/components/ui/magic-card"
import { ShimmerButton } from "@/components/ui/shimmer-button"
import { Input } from "@/components/ui/input"

export function CreateCafe({ form, onSubmit }: any) {
    return (
        <MagicCard className="w-full flex-col items-start justify-center overflow-hidden border shadow-sm">
            <div className="p-6 pb-2">
                <h3 className="text-xl font-semibold leading-none tracking-tight">Create Cafe</h3>
            </div>
            <div className="p-6 pt-0 w-full">
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-3">
                    <Input placeholder="Cafe name" {...form.register("name")} className="bg-white" />
                    <ShimmerButton type="submit" className="h-10 px-6 shadow-2xl">
                        <span className="whitespace-pre-wrap text-center text-sm font-medium leading-none tracking-tight text-white dark:from-white dark:to-slate-900/10 lg:text-sm">
                            Create
                        </span>
                    </ShimmerButton>
                </form>
            </div>
        </MagicCard>
    )
}

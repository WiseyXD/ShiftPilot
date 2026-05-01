"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"

export function TopBar({ tab, cafe }: any) {
    return (
        <div className="h-14 border-b flex items-center px-4 justify-between">
            <div className="flex items-center gap-3">
                <SidebarTrigger />
                <h1 className="font-medium capitalize">{tab}</h1>
            </div>

            {cafe && (
                <div className="text-sm text-muted-foreground">
                    {cafe.name}
                </div>
            )}
        </div>
    )
}

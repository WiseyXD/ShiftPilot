"use client"

import { MagicCard } from "@/components/ui/magic-card"
import { BlurFade } from "@/components/ui/blur-fade"
import { Button } from "@/components/ui/button"

export function EmployeeList({ employees, onChat }: any) {
    if (!employees.length) return null

    return (
        <MagicCard className="w-full flex-col items-start justify-center overflow-hidden border shadow-sm">
            <div className="p-6 pb-2">
                <h3 className="text-xl font-semibold leading-none tracking-tight">Employees</h3>
            </div>
            <div className="p-6 pt-0 w-full space-y-2">
                {employees.map((emp: any, idx: number) => (
                    <BlurFade key={emp.id} delay={0.1 + idx * 0.05} inView>
                        <div className="flex justify-between items-center border rounded-lg px-3 py-2 bg-white">
                            <span>{emp.name}</span>
                            <Button size="sm" variant="outline" onClick={() => onChat(emp.id)}>
                                Chat
                            </Button>
                        </div>
                    </BlurFade>
                ))}
            </div>
        </MagicCard>
    )
}

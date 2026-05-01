"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function EmployeeList({ employees, onChat }: any) {
    if (!employees.length) return null

    return (
        <Card>
            <CardHeader>
                <CardTitle>Employees</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                {employees.map((emp: any) => (
                    <div
                        key={emp.id}
                        className="flex justify-between items-center border rounded-lg px-3 py-2"
                    >
                        <span>{emp.name}</span>
                        <Button size="sm" variant="outline" onClick={() => onChat(emp.id)}>
                            Chat
                        </Button>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

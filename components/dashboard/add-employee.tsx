"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function AddEmployee({ form, onSubmit }: any) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Add Employee</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-3">
                    <Input placeholder="Name" {...form.register("name")} />
                    <Input placeholder="Email" {...form.register("email")} />
                    <Button>Add</Button>
                </form>
            </CardContent>
        </Card>
    )
}

"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function CreateCafe({ form, onSubmit }: any) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Create Cafe</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-3">
                    <Input placeholder="Cafe name" {...form.register("name")} />
                    <Button>Create</Button>
                </form>
            </CardContent>
        </Card>
    )
}

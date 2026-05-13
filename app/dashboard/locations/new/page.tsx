"use client"

import { useActionState } from "react"
import { createLocation } from "@/app/actions/location"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import Link from "next/link"

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
]

export default function NewLocationPage() {
  const [state, action, pending] = useActionState(createLocation, null)

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Add location</h1>
        <p className="text-sm text-slate-500 mt-1">
          <Link href="/dashboard" className="underline">
            ← Back
          </Link>
        </p>
      </div>
      <Card className="p-6">
        <form action={action} className="space-y-4">
          {state?.error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
              {state.error}
            </p>
          )}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="name">
              Location name
            </label>
            <Input id="name" name="name" required placeholder="e.g. The Corner Café" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="timezone">
              Timezone
            </label>
            <select
              id="timezone"
              name="timezone"
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              defaultValue="UTC"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create location"}
          </Button>
        </form>
      </Card>
    </div>
  )
}

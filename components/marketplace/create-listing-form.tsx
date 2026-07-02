"use client"

import { useState } from "react"
import { useActionState } from "react"
import { createListing } from "@/app/actions/marketplace"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface EmployeeOption {
  id: string
  name: string
  roles: string[]
}

interface CreateListingFormProps {
  locationId: string
  employees: EmployeeOption[]
}

export function CreateListingForm({ locationId, employees }: CreateListingFormProps) {
  const [state, action, pending] = useActionState(createListing, null)
  const [type, setType] = useState<"OFFER" | "REQUEST">("REQUEST")

  const today = new Date().toISOString().slice(0, 10)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locationId" value={locationId} />
      <input type="hidden" name="type" value={type} />
      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{state.error}</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant={type === "REQUEST" ? "default" : "outline"}
          onClick={() => setType("REQUEST")}
        >
          Request staff
        </Button>
        <Button
          type="button"
          size="sm"
          variant={type === "OFFER" ? "default" : "outline"}
          onClick={() => setType("OFFER")}
        >
          Offer staff
        </Button>
      </div>

      {type === "OFFER" && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Employee to lend</label>
          <select
            name="employeeId"
            required
            defaultValue=""
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Pick an employee
            </option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.roles.length > 0 ? ` — ${e.roles.join(", ")}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700">Role</label>
        <Input name="role" required placeholder="e.g. Barista" />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700">Date</label>
        <Input name="date" type="date" required min={today} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">From</label>
          <Input name="startTime" type="time" required defaultValue="17:00" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Until</label>
          <Input name="endTime" type="time" required defaultValue="22:00" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700">Hourly rate (€)</label>
        <Input
          name="hourlyRate"
          type="number"
          step="0.01"
          min="0"
          placeholder="Leave blank for negotiable"
        />
      </div>

      <Button type="submit" size="sm" disabled={pending} className="w-full">
        {pending ? "Posting…" : type === "OFFER" ? "Post staff offer" : "Post staff request"}
      </Button>
    </form>
  )
}

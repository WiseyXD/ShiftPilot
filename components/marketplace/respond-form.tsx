"use client"

import { useActionState } from "react"
import { respondToListing } from "@/app/actions/marketplace"
import { Button } from "@/components/ui/button"

interface EmployeeOption {
  id: string
  name: string
  roles: string[]
}

interface RespondFormProps {
  listingId: string
  listingType: "OFFER" | "REQUEST"
  actingLocationId: string
  employees: EmployeeOption[]
}

export function RespondForm({
  listingId,
  listingType,
  actingLocationId,
  employees,
}: RespondFormProps) {
  const [state, action, pending] = useActionState(respondToListing, null)

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="respondingLocationId" value={actingLocationId} />
      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{state.error}</p>
      )}
      {listingType === "REQUEST" ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            name="employeeId"
            required
            defaultValue=""
            className="border border-slate-200 rounded-md px-3 py-1.5 text-sm"
          >
            <option value="" disabled>
              Pick an employee to lend
            </option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.roles.length > 0 ? ` — ${e.roles.join(", ")}` : ""}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Sending…" : "Lend this employee"}
          </Button>
        </div>
      ) : (
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Request this worker"}
        </Button>
      )}
    </form>
  )
}

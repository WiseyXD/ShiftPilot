"use client"

import { useActionState, useEffect, useState } from "react"
import { createEmployee, deleteEmployee } from "@/app/actions/employee"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useParams } from "next/navigation"
import { PageHeader } from "@/components/dashboard/page-header"
import { Trash2, Users, UserPlus } from "lucide-react"

const COMMON_ROLES = ["Barista", "Chef", "Server", "Cashier", "Manager", "Kitchen", "Host"]

function AddEmployeeForm({ locationId }: { locationId: string }) {
  const [state, action, pending] = useActionState(createEmployee, null)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])

  const toggleRole = (role: string) =>
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4" />
          Add employee
        </CardTitle>
      </CardHeader>
      <CardContent>
      <form action={action} className="space-y-4">
        <input type="hidden" name="locationId" value={locationId} />
        {selectedRoles.map((r) => (
          <input key={r} type="hidden" name="roles" value={r} />
        ))}
        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{state.error}</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Name</label>
            <Input name="name" required placeholder="Jane Smith" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Email</label>
            <Input name="email" type="email" required placeholder="jane@example.com" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Roles</label>
          <div className="flex flex-wrap gap-2">
            {COMMON_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  selectedRoles.includes(role)
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Min hours/week</label>
            <Input name="minHours" type="number" min={0} max={80} defaultValue={0} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Max hours/week</label>
            <Input name="maxHours" type="number" min={0} max={80} defaultValue={40} />
          </div>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add employee"}
        </Button>
      </form>
      </CardContent>
    </Card>
  )
}

export default function EmployeesPage() {
  const params = useParams<{ locationId: string }>()
  const locationId = params.locationId

  const [employees, setEmployees] = useState<
    { id: string; name: string; email: string; roles: string[]; minHours: number; maxHours: number }[]
  >([])

  useEffect(() => {
    fetch(`/api/locations/${locationId}/employees`)
      .then((r) => r.json())
      .then((data) => setEmployees(data.employees ?? []))
  }, [locationId])

  return (
    <div className="space-y-6">
      <PageHeader title="Employees" description="Manage your team and their working hours" />
      <AddEmployeeForm locationId={locationId} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team roster</CardTitle>
          <CardDescription>{employees.length} {employees.length === 1 ? "person" : "people"}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {employees.length === 0 ? (
            <div className="py-10 flex flex-col items-center text-center gap-2">
              <Users className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">No employees yet — add one above.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {employees.map((emp) => (
                <li key={emp.id} className="flex items-center justify-between px-5 py-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{emp.name}</p>
                    <p className="text-xs text-slate-500 truncate">{emp.email}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {emp.minHours}–{emp.maxHours} hrs/wk
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex gap-1 flex-wrap justify-end max-w-[200px]">
                      {emp.roles.map((r) => (
                        <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                      ))}
                    </div>
                    <form
                      action={async () => {
                        await deleteEmployee(emp.id)
                        setEmployees((prev) => prev.filter((e) => e.id !== emp.id))
                      }}
                    >
                      <Button type="submit" variant="ghost" size="icon" className="text-slate-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

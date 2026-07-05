"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { reassignShift, type EditState } from "@/app/actions/edit-shift"
import { Button } from "@/components/ui/button"

interface EditableCellProps {
  shiftId: string
  currentEmployeeId: string | null
  employees: { id: string; name: string }[]
}

export function EditableCell({ shiftId, currentEmployeeId, employees }: EditableCellProps) {
  const router = useRouter()
  const [selected, setSelected] = useState(currentEmployeeId ?? "")
  const [state, setState] = useState<EditState>(null)
  const [pending, setPending] = useState(false)

  const apply = async (override: boolean) => {
    setPending(true)
    const fd = new FormData()
    fd.set("shiftId", shiftId)
    fd.set("employeeId", selected)
    if (override) fd.set("override", "1")
    const result = await reassignShift(null, fd)
    setPending(false)
    setState(result)
    if (!result) router.refresh()
  }

  return (
    <div className="space-y-1 text-left">
      <select
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value)
          setState(null)
        }}
        className="w-full border border-slate-200 rounded px-1.5 py-1 text-[11px]"
      >
        <option value="">— unassigned —</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      {state && "error" in state && (
        <p className="text-[10px] text-red-600 leading-tight">{state.error}</p>
      )}
      {state && "warning" in state ? (
        <div className="space-y-1">
          <p className="text-[10px] text-amber-700 leading-tight">{state.warning}</p>
          <Button
            size="sm"
            variant="outline"
            className="h-5 text-[10px] px-1.5 border-amber-300 text-amber-700"
            disabled={pending}
            onClick={() => apply(true)}
          >
            Apply anyway
          </Button>
        </div>
      ) : (
        (selected || "") !== (currentEmployeeId ?? "") && (
          <Button
            size="sm"
            variant="outline"
            className="h-5 text-[10px] px-1.5"
            disabled={pending}
            onClick={() => apply(false)}
          >
            {pending ? "…" : "Apply"}
          </Button>
        )
      )}
    </div>
  )
}

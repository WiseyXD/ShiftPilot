"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { addShift, type EditState } from "@/app/actions/edit-shift"
import { Button } from "@/components/ui/button"

interface AddShiftCellProps {
  scheduleId: string
  shiftTemplateId: string
  dayOfWeek: number
  employees: { id: string; name: string }[]
}

// Edit-mode control for an empty slot (the "—" cells): create the shift,
// optionally with someone already on it — same validation as a reassign.
export function AddShiftCell({ scheduleId, shiftTemplateId, dayOfWeek, employees }: AddShiftCellProps) {
  const router = useRouter()
  const [selected, setSelected] = useState("")
  const [state, setState] = useState<EditState>(null)
  const [pending, setPending] = useState(false)

  const apply = async (override: boolean) => {
    setPending(true)
    const fd = new FormData()
    fd.set("scheduleId", scheduleId)
    fd.set("shiftTemplateId", shiftTemplateId)
    fd.set("dayOfWeek", String(dayOfWeek))
    fd.set("employeeId", selected)
    if (override) fd.set("override", "1")
    const result = await addShift(null, fd)
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
        className="w-full border border-dashed border-slate-300 rounded px-1.5 py-1 text-[11px] text-slate-500"
      >
        <option value="">+ add shift…</option>
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
            Add anyway
          </Button>
        </div>
      ) : (
        selected !== "" && (
          <Button
            size="sm"
            variant="outline"
            className="h-5 text-[10px] px-1.5"
            disabled={pending}
            onClick={() => apply(false)}
          >
            {pending ? "…" : "Add"}
          </Button>
        )
      )}
    </div>
  )
}

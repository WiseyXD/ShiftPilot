import { describe, it, expect } from "vitest"
import { fallbackAssign } from "../generate"
import { DEFAULT_COMPLIANCE_RULES } from "@/lib/compliance/rules"

// A freely assignable worker so category/availability never interferes —
// what's under test is the legal layer inside generation.
const worker = {
  id: "w1",
  name: "Willi",
  roles: [],
  minHours: 0,
  maxHours: 80,
  category: "TEILZEIT_FEST" as const,
}

describe("fallbackAssign respects working-time law", () => {
  it("never schedules an early shift with insufficient rest after the previous day's late one", () => {
    // 4h shifts so the 8h daily cap never interferes — only rest is at stake.
    const late = { id: "late", name: "Late", startTime: "19:00", endTime: "23:00", minHeadcount: 1, requiredRoles: [] }
    const early = { id: "early", name: "Early", startTime: "07:00", endTime: "11:00", minHeadcount: 1, requiredRoles: [] }

    const result = fallbackAssign([late, early], [worker], [], { rules: DEFAULT_COMPLIANCE_RULES }).assignments

    const lateDays = result.filter((a) => a.shiftTemplateId === "late" && a.filled)
    expect(lateDays).toHaveLength(7) // 4h/day, 28h/week — all fine
    // 23:00 close → 07:00 start is 8h rest < 10h. Only the chronologically
    // first day of the Monday-start week (dayOfWeek 1) has no previous late
    // shift and may take the early one; Sunday (dayOfWeek 0) is the LAST day.
    const earlyFilled = result.filter((a) => a.shiftTemplateId === "early" && a.filled)
    expect(earlyFilled.map((a) => a.dayOfWeek)).toEqual([1])
  })

  it("stops at the weekly net-hours cap", () => {
    // 8.5h span = 8h net per day; 7 days would be 56h > 48h — only 6 fit.
    const day = { id: "day", name: "Day", startTime: "09:00", endTime: "17:30", minHeadcount: 1, requiredRoles: [] }
    const result = fallbackAssign([day], [worker], [], { rules: DEFAULT_COMPLIANCE_RULES }).assignments
    expect(result.filter((a) => a.filled)).toHaveLength(6)
    expect(result.filter((a) => !a.filled)).toHaveLength(1)
  })
})

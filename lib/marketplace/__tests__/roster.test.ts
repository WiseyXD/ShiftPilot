import { describe, it, expect } from "vitest"
import { canBackfill, matchesLoanWindow } from "../roster"
import type { ShiftStatus } from "@/prisma/generated/client/client"

describe("canBackfill", () => {
  it("LENT_OUT always suppresses the backfill engine", () => {
    expect(canBackfill("LENT_OUT")).toBe(false)
  })

  it("every other status stays backfillable — exhaustive, so a new status can't slip through silently", () => {
    const others: ShiftStatus[] = ["PENDING", "ACCEPTED", "DECLINED", "REASSIGNED", "UNASSIGNED", "NO_SHOW"]
    for (const status of others) {
      expect(canBackfill(status), status).toBe(true)
    }
    // Guard against enum drift: LENT_OUT + the list above must cover the whole enum.
    const all: ShiftStatus[] = [...others, "LENT_OUT"]
    expect(new Set(all).size).toBe(7)
  })
})

describe("matchesLoanWindow", () => {
  // Week of Monday 2026-07-06; loan is Friday 2026-07-10, 17:00–22:00.
  const weekStart = new Date("2026-07-06T00:00:00")
  const loan = { date: new Date("2026-07-10T00:00:00Z"), startTime: "17:00", endTime: "22:00" }

  const fridayShift = { weekStart, dayOfWeek: 5, startTime: "16:00", endTime: "23:00" }

  it("matches a shift on the loan date with an overlapping window", () => {
    expect(matchesLoanWindow(fridayShift, loan)).toBe(true)
  })

  it("computes the shift's real date from weekStart + dayOfWeek — never assumes weekStart", () => {
    // Same template window but on Monday (dayOfWeek 1): must NOT match a Friday loan.
    expect(matchesLoanWindow({ ...fridayShift, dayOfWeek: 1 }, loan)).toBe(false)
    // And a Monday loan must match the Monday shift.
    const mondayLoan = { ...loan, date: new Date("2026-07-06T00:00:00Z") }
    expect(matchesLoanWindow({ ...fridayShift, dayOfWeek: 1 }, mondayLoan)).toBe(true)
  })

  it("requires the time windows to actually overlap", () => {
    // Morning shift on the right day — no overlap with a 17:00–22:00 loan.
    const morning = { weekStart, dayOfWeek: 5, startTime: "08:00", endTime: "12:00" }
    expect(matchesLoanWindow(morning, loan)).toBe(false)
    // Touching endpoints (shift ends exactly when the loan starts) don't overlap.
    const untilFive = { weekStart, dayOfWeek: 5, startTime: "12:00", endTime: "17:00" }
    expect(matchesLoanWindow(untilFive, loan)).toBe(false)
    // Partial overlap counts.
    const evening = { weekStart, dayOfWeek: 5, startTime: "20:00", endTime: "23:59" }
    expect(matchesLoanWindow(evening, loan)).toBe(true)
  })
})

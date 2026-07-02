// Roster effects of a filled loan. Pure matching logic here; the DB writes
// live in roster-effects.ts so this stays unit-testable.

import type { ShiftStatus } from "@/prisma/generated/client/client"
import { getShiftStart } from "@/lib/scheduling/shift-date"

// LENT_OUT is the ONLY thing standing between a lent shift and a backfill
// cascade — the freeze window gates swaps, not the replacement engine.
export function canBackfill(status: ShiftStatus): boolean {
  return status !== "LENT_OUT"
}

interface ShiftSlot {
  weekStart: Date
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface LoanWindow {
  date: Date
  startTime: string
  endTime: string
}

export function matchesLoanWindow(shift: ShiftSlot, loan: LoanWindow): boolean {
  // Real shift date = weekStart + dayOfWeek offset — never weekStart itself.
  const shiftDate = getShiftStart(new Date(shift.weekStart), shift.dayOfWeek, shift.startTime)
  const loanDate = new Date(loan.date)
  const sameDay =
    shiftDate.getFullYear() === loanDate.getUTCFullYear() &&
    shiftDate.getMonth() === loanDate.getUTCMonth() &&
    shiftDate.getDate() === loanDate.getUTCDate()
  if (!sameDay) return false

  // "HH:MM" strings compare correctly lexicographically; touching edges don't overlap.
  return shift.startTime < loan.endTime && loan.startTime < shift.endTime
}

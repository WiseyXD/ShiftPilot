// DB writes for a FILLED loan's roster effects. Idempotent: re-running finds
// nothing left to update.

import { prisma } from "@/prisma/client"
import { matchesLoanWindow } from "./roster"

interface LoadedShift {
  id: string
  dayOfWeek: number
  schedule: { weekStart: Date }
  shiftTemplate: { startTime: string; endTime: string }
}

const toSlot = (s: LoadedShift) => ({
  weekStart: s.schedule.weekStart,
  dayOfWeek: s.dayOfWeek,
  startTime: s.shiftTemplate.startTime,
  endTime: s.shiftTemplate.endTime,
})

export async function applyLoanRosterEffects(dealId: string) {
  const deal = await prisma.sharingDeal.findUnique({
    where: { id: dealId },
    include: { listing: true },
  })
  if (!deal || deal.status !== "FILLED") {
    return { lenderShiftId: null, borrowerShiftId: null }
  }

  const loan = {
    date: deal.listing.date,
    startTime: deal.listing.startTime,
    endTime: deal.listing.endTime,
  }

  // Lender: if the lent worker was scheduled in the loan window, that shift is
  // now LENT_OUT — which is the only guard against the backfill cascade.
  const lenderShifts = await prisma.shift.findMany({
    where: {
      employeeId: deal.employeeId,
      status: { in: ["PENDING", "ACCEPTED", "REASSIGNED"] },
      schedule: { locationId: deal.lenderLocationId },
    },
    include: { schedule: { select: { weekStart: true } }, shiftTemplate: true },
  })
  const lenderShift = lenderShifts.find((s) => matchesLoanWindow(toSlot(s), loan))
  if (lenderShift) {
    await prisma.shift.update({
      where: { id: lenderShift.id },
      data: { status: "LENT_OUT", sharingDealId: deal.id },
    })
  }

  // Borrower: mark the unfilled shift the loan covers. employeeId stays null —
  // the borrowed worker is never a cross-tenant Employee row.
  const borrowerShifts = await prisma.shift.findMany({
    where: {
      employeeId: null,
      sharingDealId: null,
      schedule: { locationId: deal.borrowerLocationId },
    },
    include: { schedule: { select: { weekStart: true } }, shiftTemplate: true },
  })
  const borrowerShift = borrowerShifts.find((s) => matchesLoanWindow(toSlot(s), loan))
  if (borrowerShift) {
    await prisma.shift.update({
      where: { id: borrowerShift.id },
      data: { sharingDealId: deal.id },
    })
  }

  return {
    lenderShiftId: lenderShift?.id ?? null,
    borrowerShiftId: borrowerShift?.id ?? null,
  }
}

import type { StripePlan } from "@/prisma/generated/client/client"

export const STARTER_LOCATION_LIMIT = 1
export const STARTER_EMPLOYEE_LIMIT = 15

export function isPro(plan: StripePlan) {
  return plan === "PRO" || plan === "TRIAL"
}

export function canAddLocation(plan: StripePlan, currentCount: number) {
  if (isPro(plan)) return true
  return currentCount < STARTER_LOCATION_LIMIT
}

export function canAddEmployee(plan: StripePlan, currentCount: number) {
  if (isPro(plan)) return true
  return currentCount < STARTER_EMPLOYEE_LIMIT
}

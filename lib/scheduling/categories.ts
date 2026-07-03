// Category rules (concept doc §2): Minijob/Zeitarbeit are availability-bound
// and may accept/decline; Teilzeit/Fest are freely assignable and may only
// request a change through the manager.

import type { EmployeeCategory } from "@/prisma/generated/client/client"

export function needsAvailability(category: EmployeeCategory): boolean {
  return category === "MINIJOB_ZEITARBEIT"
}

export function isAssignable(category: EmployeeCategory, hasAvailabilityForSlot: boolean): boolean {
  return needsAvailability(category) ? hasAvailabilityForSlot : true
}

export type NotificationMode = "ACCEPT_DECLINE" | "INFO_CHANGE_REQUEST"

export function notificationMode(category: EmployeeCategory): NotificationMode {
  return category === "TEILZEIT_FEST" ? "INFO_CHANGE_REQUEST" : "ACCEPT_DECLINE"
}

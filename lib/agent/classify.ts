// Pure instant-vs-confirm policy — the autonomy line agreed for #43: reads
// and DRAFT edits run instantly; destructive or outward-facing calls (staff
// get notified, people get deleted, rules constrain future schedules) show a
// preview and wait for the owner's yes.

export interface ConfirmTarget {
  scheduleStatus?: "DRAFT" | "APPROVED" | "PUBLISHED" | null
}

const ALWAYS_CONFIRM = new Set(["publish_schedule", "delete_employee", "create_rule"])

// Shift edits notify the affected staff as soon as the schedule left DRAFT.
const SCHEDULE_EDITS = new Set(["reassign_shift", "unassign_shift"])

export function needsConfirmation(tool: string, target: ConfirmTarget = {}): boolean {
  if (ALWAYS_CONFIRM.has(tool)) return true
  if (SCHEDULE_EDITS.has(tool)) return target.scheduleStatus !== "DRAFT"
  return false
}

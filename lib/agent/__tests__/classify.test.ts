import { describe, it, expect } from "vitest"
import { needsConfirmation } from "../classify"

describe("needsConfirmation — the autonomy line", () => {
  it("always confirms destructive/outward tools regardless of state", () => {
    expect(needsConfirmation("publish_schedule")).toBe(true)
    expect(needsConfirmation("delete_employee")).toBe(true)
    expect(needsConfirmation("create_rule")).toBe(true)
    expect(needsConfirmation("publish_schedule", { scheduleStatus: "DRAFT" })).toBe(true)
  })

  it("runs schedule edits instantly while the schedule is a DRAFT", () => {
    expect(needsConfirmation("reassign_shift", { scheduleStatus: "DRAFT" })).toBe(false)
    expect(needsConfirmation("unassign_shift", { scheduleStatus: "DRAFT" })).toBe(false)
  })

  it("confirms schedule edits once staff were notified (APPROVED/PUBLISHED)", () => {
    expect(needsConfirmation("reassign_shift", { scheduleStatus: "APPROVED" })).toBe(true)
    expect(needsConfirmation("reassign_shift", { scheduleStatus: "PUBLISHED" })).toBe(true)
    expect(needsConfirmation("unassign_shift", { scheduleStatus: "PUBLISHED" })).toBe(true)
  })

  it("treats a missing schedule status as outward-facing (safe default)", () => {
    expect(needsConfirmation("reassign_shift")).toBe(true)
    expect(needsConfirmation("reassign_shift", {})).toBe(true)
  })

  it("never confirms reads or fact-recording tools", () => {
    for (const tool of [
      "get_schedule",
      "get_hours",
      "report_sick",
      "create_vacation",
      "create_employee",
      "update_employee",
      "generate_schedule",
      "delete_rule",
    ]) {
      expect(needsConfirmation(tool)).toBe(false)
    }
  })
})

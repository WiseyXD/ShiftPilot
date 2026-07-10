import { describe, it, expect } from "vitest"
import { buildInverse } from "../undo"

describe("buildInverse — undo descriptors", () => {
  it("reassign over a previous holder inverts to reassigning them back (with override)", () => {
    const inv = buildInverse({
      tool: "reassign_shift",
      params: { shiftId: "sh1", employeeId: "new" },
      prior: { employeeId: "old", employeeName: "Emma" },
    })
    expect(inv).toEqual({
      tool: "reassign_shift",
      params: { shiftId: "sh1", employeeId: "old", override: true },
      preview: "Schicht zurück an Emma",
    })
  })

  it("reassign onto an open shift inverts to unassign", () => {
    const inv = buildInverse({
      tool: "reassign_shift",
      params: { shiftId: "sh1", employeeId: "new" },
      prior: { employeeId: null },
    })
    expect(inv?.tool).toBe("unassign_shift")
    expect(inv?.params).toEqual({ shiftId: "sh1" })
  })

  it("unassign inverts to reassigning the previous holder", () => {
    const inv = buildInverse({
      tool: "unassign_shift",
      params: { shiftId: "sh1" },
      prior: { employeeId: "e1", employeeName: "Tim" },
    })
    expect(inv?.tool).toBe("reassign_shift")
    expect(inv?.params).toEqual({ shiftId: "sh1", employeeId: "e1", override: true })
  })

  it("unassigning an already-open shift has no inverse", () => {
    expect(buildInverse({ tool: "unassign_shift", params: { shiftId: "sh1" }, prior: { employeeId: null } })).toBeNull()
  })

  it("vacation create/delete invert into each other", () => {
    const del = buildInverse({
      tool: "create_vacation",
      params: { employeeId: "e1", startDate: "2026-07-20", endDate: "2026-07-27" },
      prior: { vacationId: "v1" },
    })
    expect(del?.tool).toBe("delete_vacation")
    expect(del?.params).toEqual({ vacationId: "v1" })

    const recreate = buildInverse({
      tool: "delete_vacation",
      params: { vacationId: "v1" },
      prior: { employeeId: "e1", startDate: "2026-07-20", endDate: "2026-07-27" },
    })
    expect(recreate?.tool).toBe("create_vacation")
    expect(recreate?.params).toEqual({ employeeId: "e1", startDate: "2026-07-20", endDate: "2026-07-27" })
  })

  it("rule create inverts to delete; rule delete inverts to restore with full prior shape", () => {
    expect(buildInverse({ tool: "create_rule", params: {}, prior: { ruleId: "r1" } })?.tool).toBe("delete_rule")
    const restore = buildInverse({
      tool: "delete_rule",
      params: { ruleId: "r1" },
      prior: { kind: "NEVER_TOGETHER", params: { employeeIds: ["a", "b"] }, sourceText: "x", plain: "A and B never together" },
    })
    expect(restore?.tool).toBe("restore_rule")
    expect(restore?.params).toMatchObject({ kind: "NEVER_TOGETHER", plain: "A and B never together" })
  })

  it("update_employee inverts to restoring exactly the prior fields", () => {
    const inv = buildInverse({
      tool: "update_employee",
      params: { employeeId: "e1", fields: { hourlyWage: 15 } },
      prior: { fields: { hourlyWage: 13.9 } },
    })
    expect(inv?.tool).toBe("update_employee")
    expect(inv?.params).toEqual({ employeeId: "e1", fields: { hourlyWage: 13.9 } })
  })

  it("irreversible actions produce no inverse", () => {
    for (const tool of ["publish_schedule", "generate_schedule", "report_sick", "delete_employee"]) {
      expect(buildInverse({ tool, params: {}, prior: {} })).toBeNull()
    }
    // deleting a person can't be reconstructed even with a prior snapshot
    expect(buildInverse({ tool: "delete_employee", params: { employeeId: "e1" }, prior: { name: "Emma" } })).toBeNull()
  })
})

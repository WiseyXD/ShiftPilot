// Dispatcher-seam tests (#43): a structured tool call goes in — as if the LLM
// proposed it — and we assert the guarded outcome: instant-vs-confirm
// classification, guard refusals, pending lifecycle, undo and audit records.
// The DB and the wrapped server actions are mocked at the boundary; the LLM
// is outside the seam entirely.

import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockPrisma } = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
  })
  return {
    mockPrisma: {
      employee: model(),
      shift: model(),
      schedule: model(),
      agentAction: model(),
      auditLog: model(),
      managerRule: model(),
      vacation: model(),
      sickCall: model(),
      location: model(),
      chatMessage: model(),
      shiftTemplate: model(),
      availabilityConfirmation: model(),
      availabilityOverride: model(),
      swapRequest: model(),
    },
  }
})

vi.mock("@/prisma/client", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn() } }))
vi.mock("@/lib/analytics/kpis", () => ({ getHoursDistribution: vi.fn() }))
vi.mock("@/app/actions/edit-shift", () => ({ reassignShift: vi.fn() }))
vi.mock("@/app/actions/schedule", () => ({ approveSchedule: vi.fn(), manualGenerateSchedule: vi.fn() }))
vi.mock("@/app/actions/manager-rules", () => ({
  parseManagerRule: vi.fn(),
  saveManagerRule: vi.fn(),
  deleteManagerRule: vi.fn(),
}))
vi.mock("@/app/actions/vacation", () => ({ createVacation: vi.fn(), deleteVacation: vi.fn() }))
vi.mock("@/app/actions/employee", () => ({
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
}))

import { dispatchToolCall, confirmPending, declinePending, undoLast } from "../dispatcher"
import { weekStartFor } from "../resolve"
import { reassignShift } from "@/app/actions/edit-shift"
import { approveSchedule } from "@/app/actions/schedule"
import { deleteEmployee } from "@/app/actions/employee"
import type { AgentContext } from "../types"

const ctx: AgentContext = {
  userId: "owner1",
  locationId: "loc1",
  sourceText: "nimm Emma für Freitag Abend",
}

const monday = weekStartFor(0)
const roster = [
  { id: "e1", name: "Emma Klein" },
  { id: "e2", name: "Tim Wagner" },
]
const openFridayShift = {
  id: "sh1",
  dayOfWeek: 5,
  status: "UNASSIGNED",
  employeeId: null,
  employee: null,
  shiftTemplate: { name: "Abend", startTime: "17:00", endTime: "23:00" },
}
const scheduleWith = (status: string) => ({
  id: "s1",
  status,
  weekStart: monday,
  shifts: [openFridayShift],
})
const shiftRowForExecute = {
  ...openFridayShift,
  schedule: { weekStart: monday },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.employee.findMany.mockResolvedValue(roster)
  mockPrisma.employee.findFirst.mockResolvedValue(roster[0])
  mockPrisma.shift.findFirst.mockResolvedValue(shiftRowForExecute)
  mockPrisma.agentAction.create.mockResolvedValue({ id: "act1" })
  mockPrisma.agentAction.update.mockResolvedValue({ id: "act1" })
  mockPrisma.auditLog.create.mockResolvedValue({})
})

describe("classification at the seam", () => {
  it("executes a DRAFT-schedule edit instantly through the real action, with audit + inverse", async () => {
    mockPrisma.schedule.findFirst.mockResolvedValue(scheduleWith("DRAFT"))
    vi.mocked(reassignShift).mockResolvedValue(null)

    const outcome = await dispatchToolCall(ctx, "reassign_shift", {
      employeeName: "Emma",
      dayOfWeek: 5,
      weekOffset: 0,
    })

    expect(outcome.kind).toBe("done")
    expect(reassignShift).toHaveBeenCalledOnce()
    // executed record carries the inverse (open shift → unassign)
    const created = mockPrisma.agentAction.create.mock.calls[0][0].data
    expect(created.status).toBe("EXECUTED")
    expect(created.inverse.tool).toBe("unassign_shift")
    // audit carries the owner's original sentence
    const audit = mockPrisma.auditLog.create.mock.calls[0][0].data
    expect(audit.action).toBe("AGENT_ACTION")
    expect(audit.aiReasoning).toBe(ctx.sourceText)
  })

  it("proposes instead of executing when the schedule is PUBLISHED", async () => {
    mockPrisma.schedule.findFirst.mockResolvedValue(scheduleWith("PUBLISHED"))

    const outcome = await dispatchToolCall(ctx, "reassign_shift", {
      employeeName: "Emma",
      dayOfWeek: 5,
      weekOffset: 0,
    })

    expect(outcome.kind).toBe("pending")
    expect(reassignShift).not.toHaveBeenCalled()
    expect(mockPrisma.agentAction.create.mock.calls[0][0].data.status).toBe("PENDING")
    if (outcome.kind === "pending") {
      const commands = outcome.reply.actions?.map((a) => a.command)
      expect(commands).toEqual(["CONFIRM:act1", "CANCEL:act1"])
    }
  })

  it("publish_schedule is always a proposal — approve is never called directly", async () => {
    mockPrisma.schedule.findFirst.mockResolvedValue({
      id: "s1",
      status: "DRAFT",
      weekStart: monday,
      shifts: [{ status: "PENDING" }, { status: "UNASSIGNED" }],
    })

    const outcome = await dispatchToolCall(ctx, "publish_schedule", {})
    expect(outcome.kind).toBe("pending")
    expect(approveSchedule).not.toHaveBeenCalled()
  })

  it("delete_employee is always a proposal", async () => {
    mockPrisma.shift.count.mockResolvedValue(2)
    const outcome = await dispatchToolCall(ctx, "delete_employee", { employeeName: "Emma" })
    expect(outcome.kind).toBe("pending")
    expect(deleteEmployee).not.toHaveBeenCalled()
    if (outcome.kind === "pending") expect(outcome.reply.body).toContain("Emma Klein")
  })
})

describe("guards surface as refusals", () => {
  it("hard legal block from the shared action becomes an error — nothing recorded", async () => {
    mockPrisma.schedule.findFirst.mockResolvedValue(scheduleWith("DRAFT"))
    vi.mocked(reassignShift).mockResolvedValue({
      error: "Blocked by ArbZG DAILY_MAX: 11.5h net exceeds 10h",
    })

    const outcome = await dispatchToolCall(ctx, "reassign_shift", {
      employeeName: "Emma",
      dayOfWeek: 5,
      weekOffset: 0,
    })

    expect(outcome.kind).toBe("error")
    if (outcome.kind === "error") expect(outcome.reply.body).toContain("ArbZG")
    expect(mockPrisma.agentAction.create).not.toHaveBeenCalled()
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled()
  })

  it("a soft conflict becomes an override proposal, not a silent write", async () => {
    mockPrisma.schedule.findFirst.mockResolvedValue(scheduleWith("DRAFT"))
    vi.mocked(reassignShift).mockResolvedValue({ warning: "Emma Klein has a Sperrzeit here" })

    const outcome = await dispatchToolCall(ctx, "reassign_shift", {
      employeeName: "Emma",
      dayOfWeek: 5,
      weekOffset: 0,
    })

    expect(outcome.kind).toBe("pending")
    const created = mockPrisma.agentAction.create.mock.calls[0][0].data
    expect(created.status).toBe("PENDING")
    expect(created.params.override).toBe(true)
    if (outcome.kind === "pending") expect(outcome.reply.body).toContain("Sperrzeit")
  })

  it("ambiguous names are rejected, never guessed", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([
      { id: "e1", name: "Emma Klein" },
      { id: "e3", name: "Emma Roth" },
    ])
    const outcome = await dispatchToolCall(ctx, "reassign_shift", {
      employeeName: "Emma",
      dayOfWeek: 5,
      weekOffset: 0,
    })
    expect(outcome.kind).toBe("error")
    expect(reassignShift).not.toHaveBeenCalled()
  })

  it("unknown tools and internal tools are refused", async () => {
    expect((await dispatchToolCall(ctx, "nuke_everything", {})).kind).toBe("error")
    expect((await dispatchToolCall(ctx, "restore_rule", {})).kind).toBe("error")
  })

  it("schema validation failures are refusals, not crashes", async () => {
    const outcome = await dispatchToolCall(ctx, "reassign_shift", { dayOfWeek: 99 })
    expect(outcome.kind).toBe("error")
  })
})

describe("pending lifecycle", () => {
  const pendingRow = {
    id: "act1",
    tool: "reassign_shift",
    params: { shiftId: "sh1", employeeId: "e1" },
    preview: "Emma übernimmt: Abend Freitag",
    sourceText: "original owner sentence",
    status: "PENDING",
  }

  it("confirm executes with guards re-checked and marks the row EXECUTED", async () => {
    mockPrisma.agentAction.findFirst.mockResolvedValue(pendingRow)
    vi.mocked(reassignShift).mockResolvedValue(null)

    const outcome = await confirmPending(ctx, "act1")

    expect(outcome.kind).toBe("done")
    expect(reassignShift).toHaveBeenCalledOnce()
    const update = mockPrisma.agentAction.update.mock.calls[0][0]
    expect(update.where).toEqual({ id: "act1" })
    expect(update.data.status).toBe("EXECUTED")
    // audit carries the ORIGINAL sentence, not the button command
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.aiReasoning).toBe(
      "original owner sentence"
    )
  })

  it("confirm on stale state declines the proposal and reports the guard", async () => {
    mockPrisma.agentAction.findFirst.mockResolvedValue(pendingRow)
    vi.mocked(reassignShift).mockResolvedValue({ error: "Shift not found" })

    const outcome = await confirmPending(ctx, "act1")

    expect(outcome.kind).toBe("error")
    expect(mockPrisma.agentAction.update.mock.calls[0][0].data.status).toBe("DECLINED")
  })

  it("confirming something that isn't pending (or isn't yours) is a no-op error", async () => {
    mockPrisma.agentAction.findFirst.mockResolvedValue(null)
    expect((await confirmPending(ctx, "ghost")).kind).toBe("error")
    expect(reassignShift).not.toHaveBeenCalled()
  })

  it("decline flips the row and changes nothing else", async () => {
    mockPrisma.agentAction.updateMany.mockResolvedValue({ count: 1 })
    const outcome = await declinePending(ctx, "act1")
    expect(outcome.kind).toBe("done")
    expect(reassignShift).not.toHaveBeenCalled()

    mockPrisma.agentAction.updateMany.mockResolvedValue({ count: 0 })
    expect((await declinePending(ctx, "act1")).kind).toBe("error")
  })
})

describe("undo", () => {
  it("runs the recorded inverse through the same guarded path and marks the original UNDONE", async () => {
    mockPrisma.agentAction.findMany.mockResolvedValue([
      {
        id: "act1",
        status: "EXECUTED",
        preview: "Emma übernimmt: Abend Freitag",
        sourceText: "orig",
        inverse: { tool: "unassign_shift", params: { shiftId: "sh1" }, preview: "freigeben" },
      },
    ])
    mockPrisma.shift.findFirst.mockResolvedValue({
      ...shiftRowForExecute,
      status: "REASSIGNED",
      employeeId: "e1",
      employee: { id: "e1", name: "Emma Klein" },
    })
    vi.mocked(reassignShift).mockResolvedValue(null)

    const outcome = await undoLast(ctx)

    expect(outcome.kind).toBe("done")
    expect(reassignShift).toHaveBeenCalledOnce()
    const updates = mockPrisma.agentAction.update.mock.calls.map((c) => c[0])
    expect(updates).toContainEqual({ where: { id: "act1" }, data: { status: "UNDONE" } })
  })

  it("nothing reversible → honest refusal", async () => {
    mockPrisma.agentAction.findMany.mockResolvedValue([
      { id: "a2", status: "EXECUTED", inverse: null, preview: "x", sourceText: "y" },
    ])
    expect((await undoLast(ctx)).kind).toBe("error")
  })
})

describe("reads pass through as data for the LLM", () => {
  it("get_schedule returns a text block, no confirmation, no audit", async () => {
    mockPrisma.schedule.findFirst.mockResolvedValue(scheduleWith("DRAFT"))
    const outcome = await dispatchToolCall(ctx, "get_schedule", { weekOffset: 0 })
    expect(outcome.kind).toBe("data")
    if (outcome.kind === "data") expect(outcome.data).toContain("Abend")
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled()
  })
})

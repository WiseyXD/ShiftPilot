import { describe, it, expect } from "vitest"
import { fallbackAssign } from "../generate"
import { DEFAULT_COMPLIANCE_RULES } from "@/lib/compliance/rules"

const tmpl = (id: string, start: string, end: string) => ({
  id,
  name: id,
  startTime: start,
  endTime: end,
  minHeadcount: 1,
  requiredRoles: [],
})

const emp = (id: string, over: Partial<Parameters<typeof fallbackAssign>[1][number]> = {}) => ({
  id,
  name: id,
  roles: [],
  minHours: 0,
  maxHours: 80,
  category: "TEILZEIT_FEST" as const,
  wishWeight: "MEDIUM" as const,
  ...over,
})

const day = tmpl("day", "10:00", "16:00")

describe("solver hierarchy (doc §3): lower levels never override higher ones", () => {
  it("level 4 (contract hours): whoever is furthest below their minimum gets the slot", () => {
    // Both eligible everywhere; Needy has minHours 30, Casual 0. Needy should
    // dominate assignments until the target is closer.
    const needy = emp("needy", { minHours: 30 })
    const casual = emp("casual")
    // Favored employee deliberately LAST — array order must not decide.
    const { assignments } = fallbackAssign([day], [casual, needy], [])
    const needyCount = assignments.filter((a) => a.employeeId === "needy").length
    const casualCount = assignments.filter((a) => a.employeeId === "casual").length
    expect(needyCount).toBeGreaterThan(casualCount)
  })

  it("level 6 (wishes): a HIGH-weight wish beats a LOW one when hours are level", () => {
    // Category A both, available on the same single slot; both at 0 hours,
    // same minHours — wish weight is the only differentiator.
    const eager = emp("eager", { category: "MINIJOB_ZEITARBEIT", wishWeight: "HIGH" })
    const meh = emp("meh", { category: "MINIJOB_ZEITARBEIT", wishWeight: "LOW" })
    const avail = [
      { employeeId: "eager", shiftTemplateId: "day", dayOfWeek: 3, available: true },
      { employeeId: "meh", shiftTemplateId: "day", dayOfWeek: 3, available: true },
    ]
    // HIGH-weight employee deliberately LAST in the array.
    const { assignments } = fallbackAssign([day], [meh, eager], avail)
    expect(assignments.find((a) => a.dayOfWeek === 3)?.employeeId).toBe("eager")
  })

  it("level 3 beats level 6: availability is hard for category A, any wish weight", () => {
    const eager = emp("eager", { category: "MINIJOB_ZEITARBEIT", wishWeight: "HIGH" })
    const { assignments } = fallbackAssign([day], [eager], []) // no availability at all
    expect(assignments.every((a) => a.employeeId === null)).toBe(true)
  })

  it("level 2 beats level 4: a pin wins even against someone far below min hours", () => {
    const needy = emp("needy", { minHours: 40 })
    const pinned = emp("pinned")
    const { assignments } = fallbackAssign([day], [needy, pinned], [], {
      pins: [{ employeeId: "pinned", shiftTemplateId: "day", dayOfWeek: 2, weekStart: null }],
    })
    expect(assignments.find((a) => a.dayOfWeek === 2)?.employeeId).toBe("pinned")
  })

  it("level 1 beats level 2: an illegal pin is refused with the rule named", () => {
    // Pin the same person onto two same-day slots totalling > 8h net.
    const morning = tmpl("morning", "06:00", "12:00")
    const evening = tmpl("evening", "16:00", "21:00")
    const worker = emp("worker")
    const { assignments, conflicts } = fallbackAssign([morning, evening], [worker], [], {
      pins: [
        { employeeId: "worker", shiftTemplateId: "morning", dayOfWeek: 2, weekStart: null },
        { employeeId: "worker", shiftTemplateId: "evening", dayOfWeek: 2, weekStart: null },
      ],
    })
    // Morning pin lands; the evening pin would blow the daily cap → rejected,
    // and the slot can't be filled legally by the same (only) worker either.
    const morningTue = assignments.find((a) => a.shiftTemplateId === "morning" && a.dayOfWeek === 2)
    const eveningTue = assignments.find((a) => a.shiftTemplateId === "evening" && a.dayOfWeek === 2)
    expect(morningTue?.employeeId).toBe("worker")
    expect(eveningTue?.employeeId).toBeNull()
    expect(conflicts.some((c) => c.includes("DAILY_MAX"))).toBe(true)
  })

  it("unfillable slots stay UNASSIGNED and the blocking level is explained", () => {
    const mini = emp("mini", { category: "MINIJOB_ZEITARBEIT" })
    const { assignments, conflicts } = fallbackAssign([day], [mini], [])
    expect(assignments.every((a) => !a.filled)).toBe(true)
    expect(conflicts.some((c) => c.toLowerCase().includes("availability"))).toBe(true)
  })
})

describe("headcount: a shift's minHeadcount is honoured, not just one person", () => {
  const two = { ...day, id: "two", name: "two", minHeadcount: 2 }

  it("fills minHeadcount DISTINCT employees for every slot when staff allow", () => {
    const { assignments } = fallbackAssign([two], [emp("a"), emp("b"), emp("c")], [])
    for (let d = 0; d < 7; d++) {
      const filled = assignments.filter((x) => x.dayOfWeek === d && x.filled)
      expect(filled.length).toBe(2)
      expect(new Set(filled.map((x) => x.employeeId)).size).toBe(2) // two different people
    }
  })

  it("emits one open seat (never a duplicate) when there aren't enough staff", () => {
    const { assignments, conflicts } = fallbackAssign([two], [emp("solo")], [])
    const mon = assignments.filter((x) => x.dayOfWeek === 1)
    expect(mon.length).toBe(2) // two seats emitted
    expect(mon.filter((x) => x.filled).length).toBe(1)
    expect(mon.filter((x) => x.employeeId === null).length).toBe(1)
    expect(conflicts.some((c) => c.includes("1/2 filled"))).toBe(true)
  })
})

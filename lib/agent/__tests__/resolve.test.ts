import { describe, it, expect } from "vitest"
import { currentMonday, weekStartFor, chronologicalDay, resolveShift, type ResolvableShift } from "../resolve"

const shift = (over: Partial<ResolvableShift>): ResolvableShift => ({
  id: "s1",
  dayOfWeek: 5,
  status: "PENDING",
  employeeId: "e1",
  employeeName: "Emma Klein",
  templateName: "Abend",
  startTime: "17:00",
  endTime: "23:00",
  ...over,
})

describe("week math", () => {
  it("currentMonday is always a Monday at midnight", () => {
    // 2026-07-10 is a Friday → Monday is 2026-07-06
    const monday = currentMonday(new Date("2026-07-10T15:30:00"))
    expect(monday.getDay()).toBe(1)
    expect(monday.getDate()).toBe(6)
    expect(monday.getHours()).toBe(0)
  })

  it("a Sunday still belongs to the week that started the previous Monday", () => {
    const monday = currentMonday(new Date("2026-07-12T09:00:00")) // Sunday
    expect(monday.getDate()).toBe(6)
  })

  it("weekStartFor offsets whole weeks", () => {
    const next = weekStartFor(1, new Date("2026-07-10T12:00:00"))
    expect(next.getDate()).toBe(13)
    expect(next.getDay()).toBe(1)
  })

  it("chronologicalDay puts Sunday LAST in a Monday-start week", () => {
    expect(chronologicalDay(1)).toBe(1) // Monday first
    expect(chronologicalDay(6)).toBe(6) // Saturday sixth
    expect(chronologicalDay(0)).toBe(7) // Sunday last
  })
})

describe("resolveShift — never guess", () => {
  it("resolves a unique match by day + employee", () => {
    const result = resolveShift(
      [shift({}), shift({ id: "s2", dayOfWeek: 6, employeeName: "Tim Wagner", employeeId: "e2" })],
      { dayOfWeek: 5, employeeName: "emma" }
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.shift.id).toBe("s1")
  })

  it("rejects ambiguity and lists the options", () => {
    const result = resolveShift(
      [shift({}), shift({ id: "s2", templateName: "Früh", startTime: "08:00", endTime: "14:00" })],
      { dayOfWeek: 5 }
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Abend")
      expect(result.error).toContain("Früh")
    }
  })

  it("template name narrows an ambiguous day", () => {
    const result = resolveShift(
      [shift({}), shift({ id: "s2", templateName: "Früh" })],
      { dayOfWeek: 5, templateName: "abend" }
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.shift.id).toBe("s1")
  })

  it("unassignedOnly filters to open shifts", () => {
    const result = resolveShift(
      [shift({}), shift({ id: "s2", status: "UNASSIGNED", employeeId: null, employeeName: null })],
      { dayOfWeek: 5, unassignedOnly: true }
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.shift.id).toBe("s2")
  })

  it("no match is an error, not a guess", () => {
    expect(resolveShift([shift({})], { dayOfWeek: 2 }).ok).toBe(false)
  })
})

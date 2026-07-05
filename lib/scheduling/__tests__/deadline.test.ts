import { describe, it, expect } from "vitest"
import { partitionSchedulable } from "../deadline"

const emp = (id: string, category: "MINIJOB_ZEITARBEIT" | "TEILZEIT_FEST") => ({
  id,
  name: id,
  category,
})

describe("partitionSchedulable", () => {
  const anna = emp("anna", "MINIJOB_ZEITARBEIT")
  const ben = emp("ben", "MINIJOB_ZEITARBEIT")
  const fest = emp("fest", "TEILZEIT_FEST")

  it("keeps category B regardless; category A only when confirmed", () => {
    const { schedulable, dropped } = partitionSchedulable([anna, ben, fest], new Set(["anna"]))
    expect(schedulable.map((e) => e.id).sort()).toEqual(["anna", "fest"])
    expect(dropped.map((e) => e.id)).toEqual(["ben"])
  })

  it("nobody confirmed: all category A dropped, category B stays", () => {
    const { schedulable, dropped } = partitionSchedulable([anna, fest], new Set())
    expect(schedulable.map((e) => e.id)).toEqual(["fest"])
    expect(dropped.map((e) => e.id)).toEqual(["anna"])
  })
})

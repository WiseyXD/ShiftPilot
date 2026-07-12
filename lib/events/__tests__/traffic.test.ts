import { describe, it, expect } from "vitest"
import { estimateTraffic } from "../traffic"

describe("estimateTraffic", () => {
  it("returns normal when there are no nearby events", () => {
    expect(estimateTraffic(0).level).toBe("normal")
  })

  it("returns elevated for one or two nearby events", () => {
    expect(estimateTraffic(1).level).toBe("elevated")
    expect(estimateTraffic(2).level).toBe("elevated")
  })

  it("returns high for three or more nearby events", () => {
    expect(estimateTraffic(3).level).toBe("high")
    expect(estimateTraffic(10).level).toBe("high")
  })
})

import { describe, it, expect } from "vitest"
import { routeMessage } from "../agent"

describe("routeMessage", () => {
  it("parses a tapped button command into command + arg", () => {
    expect(routeMessage("ACCEPT:ck123")).toEqual({ kind: "COMMAND", command: "ACCEPT", arg: "ck123" })
    expect(routeMessage("SICK:shift_9")).toEqual({ kind: "COMMAND", command: "SICK", arg: "shift_9" })
  })

  it("matches German keywords for the core intents", () => {
    expect(routeMessage("meine Schichten").kind).toBe("MY_SHIFTS")
    expect(routeMessage("Dienstplan bitte").kind).toBe("MY_SHIFTS")
    expect(routeMessage("frei").kind).toBe("OPEN_SHIFTS")
    expect(routeMessage("Ich melde mich krank").kind).toBe("SICK")
    expect(routeMessage("Hallo").kind).toBe("HELP")
  })

  it("matches English keywords too", () => {
    expect(routeMessage("my shifts").kind).toBe("MY_SHIFTS")
    expect(routeMessage("any open shifts?").kind).toBe("OPEN_SHIFTS")
    expect(routeMessage("help").kind).toBe("HELP")
  })

  it("is case-insensitive and tolerant of surrounding words", () => {
    expect(routeMessage("KRANK").kind).toBe("SICK")
    expect(routeMessage("zeig mir bitte meine schichten für morgen").kind).toBe("MY_SHIFTS")
  })

  it("falls through to UNKNOWN for free-form text (LLM handles it)", () => {
    const r = routeMessage("kann ich Dienstag mit jemandem tauschen?")
    expect(r).toEqual({ kind: "UNKNOWN", text: "kann ich Dienstag mit jemandem tauschen?" })
  })

  it("does not mistake a lowercase colon phrase for a command", () => {
    expect(routeMessage("also: keine ahnung").kind).toBe("UNKNOWN")
  })
})

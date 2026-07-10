import { describe, it, expect } from "vitest"
import { detectLanguage, t } from "../i18n"

describe("detectLanguage — EN/DE, unsure = null", () => {
  it("detects German", () => {
    expect(detectLanguage("Wer arbeitet diese Woche?")).toBe("de")
    expect(detectLanguage("Marco ist krank am Freitag")).toBe("de")
    expect(detectLanguage("Erstell den Plan für nächste Woche")).toBe("de")
    expect(detectLanguage("rückgängig")).toBe("de")
  })

  it("detects English", () => {
    expect(detectLanguage("Who works this week?")).toBe("en")
    expect(detectLanguage("take Jonas off the Saturday shift")).toBe("en")
    expect(detectLanguage("create the schedule for next week")).toBe("en")
    expect(detectLanguage("undo")).toBe("en")
  })

  it("umlauts alone push towards German", () => {
    expect(detectLanguage("Früh übernehmen")).toBe("de")
  })

  it("returns null when it can't tell (button commands, names)", () => {
    expect(detectLanguage("CONFIRM:abc123")).toBeNull()
    expect(detectLanguage("Emma")).toBeNull()
    expect(detectLanguage("")).toBeNull()
  })
})

describe("catalog", () => {
  it("both languages resolve every key (type-enforced, spot-check behavior)", () => {
    expect(t("en").declined).not.toBe(t("de").declined)
    expect(t("en").shiftBackTo("Emma")).toBe("Shift back to Emma")
    expect(t("de").shiftBackTo("Emma")).toBe("Schicht zurück an Emma")
  })

  it("unknown language falls back to English", () => {
    expect(t("fr" as never).declined).toBe(t("en").declined)
  })
})

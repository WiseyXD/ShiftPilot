// The agent's deterministic front door. Pure text → intent routing so a live
// demo never depends on the LLM: tapped buttons and keyword commands always
// resolve here; only genuinely free-form text falls through to UNKNOWN (which
// the backend hands to the LLM). German + English keywords.

export type Intent =
  | { kind: "COMMAND"; command: string; arg: string } // from a tapped reply button
  | { kind: "MY_SHIFTS" }
  | { kind: "OPEN_SHIFTS" }
  | { kind: "SICK" }
  | { kind: "HELP" }
  | { kind: "UNKNOWN"; text: string }

// A button sends e.g. "ACCEPT:ckShiftId". Commands are UPPERCASE:arg.
const COMMAND_RE = /^([A-Z_]+):(.+)$/

const MATCHERS: { kind: Exclude<Intent, { kind: "COMMAND" | "UNKNOWN" }>["kind"]; words: string[] }[] = [
  { kind: "MY_SHIFTS", words: ["plan", "meine schichten", "meine schicht", "my shifts", "schedule", "schichtplan", "dienstplan"] },
  { kind: "OPEN_SHIFTS", words: ["frei", "freie schichten", "open", "open shifts", "übernehmen", "aushelfen", "extra"] },
  { kind: "SICK", words: ["krank", "krankmeldung", "sick", "melde mich krank", "kann nicht"] },
  { kind: "HELP", words: ["hilfe", "help", "hallo", "hi", "hey", "menü", "menu", "was kannst du", "moin"] },
]

export function routeMessage(raw: string): Intent {
  const text = raw.trim()

  const cmd = text.match(COMMAND_RE)
  if (cmd) return { kind: "COMMAND", command: cmd[1], arg: cmd[2] }

  const lower = text.toLowerCase()
  for (const m of MATCHERS) {
    if (m.words.some((w) => lower === w || lower.includes(w))) {
      return { kind: m.kind } as Intent
    }
  }

  return { kind: "UNKNOWN", text }
}

// Copilot languages: English (default) and German. Deterministic replies —
// previews, confirm buttons, guard refusals, undo texts, proactive pushes —
// come from this catalog in the owner's language. Read-tool outputs stay
// English: they only feed the LLM, which answers in the owner's language.

export type Lang = "en" | "de"

export const DEFAULT_LANG: Lang = "en"

// Cheap, deterministic detection — no LLM on the deterministic path. Unsure
// means null so callers can fall back to the thread language, then English.
const DE_WORDS =
  /\b(der|die|das|und|ist|nicht|wer|wie|wann|heute|morgen|woche|nächste|schicht|schichten|krank|urlaub|bitte|mach|erstell|erstelle|veröffentlichen|veröffentliche|stunden|arbeitet|nimm|nimmt|für|mit|kann|keine|alle|regel|regeln|lösche|löschen|ändern|ändere|rückgängig|frei|freie|übernehmen|zeig|zeige|welche|wechsel|neue|neuer|mitarbeiter|entferne|trage|hinzu|von)\b/g
const EN_WORDS =
  /\b(the|who|what|when|how|is|are|not|please|make|create|generate|publish|schedule|shift|shifts|sick|vacation|hours|works|working|take|off|for|with|can|delete|rule|rules|change|show|next|week|today|remove|assign|add|new|employee|list|open|give|put|undo|status|all|of|to)\b/g

export function detectLanguage(text: string): Lang | null {
  const lower = text.toLowerCase()
  const de = (lower.match(DE_WORDS)?.length ?? 0) + (lower.match(/[äöüß]/g)?.length ?? 0)
  const en = lower.match(EN_WORDS)?.length ?? 0
  if (de > en) return "de"
  if (en > de) return "en"
  return null
}

export const DAY_LABELS: Record<Lang, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  de: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
}

export const fmtDate = (lang: Lang, d: Date) =>
  d.toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })

export const fmtDay = (lang: Lang, d: Date) =>
  d.toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })

const en = {
  // dispatcher
  confirmYes: "✅ Yes, do it",
  confirmNo: "❌ Cancel",
  shallI: "Shall I?",
  unknownTool: (name: string) => `I don't know the tool “${name}”.`,
  missingParams: (details: string) => `I'm missing some details: ${details}`,
  nothingToConfirm: "There's nothing (still) waiting for your confirmation.",
  cannotRunAnymore: "I can't run that action anymore.",
  declined: "Okay, discarded — nothing was changed. 👍",
  nothingWasPending: "There was nothing pending.",
  nothingToUndo: "I can't find anything I could undo.",
  cannotUndoThat: "That action can't be undone.",
  undone: (preview: string) => `↩️ Undone (“${preview}”).`,
  undoPrefix: (preview: string) => `↩️ Undo: ${preview}`,

  // resolve
  noShiftMatch: "I can't find a matching shift.",
  ambiguousShift: (options: string) => `That's not unique — I found: ${options}. Which one do you mean?`,

  // undo previews
  releaseShift: "Release the shift again",
  shiftBackTo: (name: string) => `Shift back to ${name}`,
  previousPerson: "the previous person",
  removeVacationAgain: "Remove the vacation again",
  restoreVacation: "Restore the vacation",
  deleteRuleAgain: "Delete the rule again",
  restoreRule: "Restore the rule",
  removePersonAgain: (name: string) => `Remove ${name} again`,
  somebody: "the person",
  resetEmployee: "Reset the employee's data",

  // shared tool bits
  noPlanForWeek: (date: string) => `There's no plan for the week starting ${date}.`,
  personNotFound: "I can't find that person.",
  shiftOrPersonGone: "I can't find that shift or person (anymore).",
  shiftGone: "I can't find that shift (anymore).",

  // reassign / unassign
  takesOver: (name: string, label: string) => `${name} takes over: ${label}`,
  insteadOf: (name: string) => ` (instead of ${name})`,
  overrideAnyway: (warning: string, name: string, label: string) =>
    `⚠️ ${warning} — assign ${name} anyway (${label})?`,
  reassigned: (name: string, label: string, prev: string | null) =>
    `✅ ${name} takes over: ${label}${prev ? ` (instead of ${prev})` : ""}. Notifications are out.`,
  shiftNotAssigned: "That shift isn't assigned to anyone.",
  takeOffShift: (name: string, label: string) => `Take ${name} off the shift: ${label}`,
  unassigned: (name: string) =>
    `✅ ${name} is off the shift — it's open now. Tell me who should take it, or ask about open shifts.`,

  // generate / publish
  generateDraft: "Create a new weekly schedule",
  generating:
    "🛠️ I'm creating the draft — it takes a moment. I'll message you here as soon as it's ready.",
  noDraftToPublish: "There's no draft to publish right now.",
  publishPreview: (date: string, total: number, open: number) =>
    `Publish the schedule for the week starting ${date} — ${total} shifts${open > 0 ? `, ${open} still open` : ""}. Every employee will be notified.`,
  publishFailed: "That didn't work — is the draft still there?",
  published: (date: string) =>
    `📣 The schedule for the week starting ${date} is out! Everyone is getting their shifts now. I'll collect the responses and reach out if anything comes up.`,

  // sick
  noUpcomingShift: (name: string) => `${name} has no matching upcoming shift.`,
  whichShiftSick: (name: string, options: string) => `${name} has several shifts — which one? ${options}`,
  sickPreview: (name: string, label: string) => `Report ${name} sick for ${label}`,
  shiftAlreadyHandled: "That shift has already been handled in the meantime.",
  sickReported: (name: string) =>
    `🤒 Get well soon, ${name}! The shift is released and I'm already looking for cover — I'll let you know as soon as someone takes it.`,

  // rules
  couldNotParseRule: "I couldn't read that as a rule.",
  newRule: (plain: string) => `New rule: “${plain}”`,
  ruleSaved: (plain: string) => `✅ Rule saved: ${plain} — it applies from the next schedule generation.`,
  ruleNotFound: "I can't find that rule.",
  ruleNotFoundAnymore: "I can't find that rule (anymore).",
  deleteRulePreview: (plain: string) => `Delete rule: “${plain}”`,
  ruleDeleted: (plain: string) => `🗑️ Rule deleted: “${plain}”.`,
  restoreRulePreview: (plain: string) => `Restore rule: “${plain}”`,
  ruleRestored: (plain: string) => `✅ Rule restored: “${plain}”.`,

  // vacations
  whoseVacation: "Whose vacation is it?",
  vacationPreview: (name: string, start: string, end: string) => `Vacation for ${name}: ${start} to ${end}`,
  vacationSaved: (name: string, start: string, end: string) =>
    `🏖️ Vacation recorded for ${name}: ${start} to ${end}.`,
  vacationNotFound: "I can't find that vacation.",
  vacationNotFoundAnymore: "I can't find that vacation (anymore).",
  severalVacations: (name: string) => `${name} has several vacations — use list_vacations and give me the id.`,
  deleteVacationPreview: (name: string, range: string) => `Delete vacation: ${name}, ${range}`,
  vacationDeleted: (name: string, range: string) => `🗑️ Deleted ${name}'s vacation (${range}).`,

  // employees
  createEmployeePreview: (name: string, category: string) => `Add ${name} (${category})`,
  employeeCreated: (name: string) =>
    `✅ ${name} is on the team! Say the word and I'll send them the availability questionnaire by email.`,
  whoToChange: "Who should I change?",
  whatToChange: "What exactly should I change?",
  changePreview: (name: string, changes: string) => `Change ${name}: ${changes}`,
  employeeUpdated: (name: string) => `✅ ${name} is updated.`,
  whoToRemove: "Who should I remove?",
  deleteEmployeePreview: (name: string, upcoming: number) =>
    `PERMANENTLY remove ${name} from the team${upcoming > 0 ? ` — ${upcoming} upcoming shift(s) will open up` : ""}. I can't undo this.`,
  deleteFailed: "That didn't work — the person is still there.",
  employeeDeleted: (name: string) => `🗑️ ${name} has been removed from the team.`,
  categoryLabel: (cat: string): string => (cat === "TEILZEIT_FEST" ? "part/full-time" : "minijob"),

  // owner-agent
  llmDown:
    "I can't reach my language model right now. You can still ask me things like *“Who works Friday?”* or *“Create the schedule”* — try again in a moment.",
  lost: "I got lost there 😅 — mind phrasing it differently?",
  howCanIHelp: "How can I help? ☕",

  // proactive pushes
  draftReady: (date: string, filled: number, total: number, open: number, dropped: string) =>
    `🛠️ The draft for the week starting ${date} is ready: ${filled}/${total} shifts filled${open > 0 ? `, ${open} still open` : ""}${dropped ? ` (${dropped} left out — no availability confirmation)` : ""}. Say *“publish”* when it looks good.`,
  replacementFound: (name: string, shift: string, date: string, time: string, forWhom: string | null) =>
    `✅ Cover found: *${name}* takes the ${shift} shift on ${date} (${time})${forWhom ? ` for ${forWhom}` : ""}.`,
  replacementFailed: (shift: string, date: string, tried: number) =>
    `⚠️ I couldn't find anyone for the ${shift} shift on ${date} — asked ${tried} people, all declined or didn't answer. Tell me who should step in and I'll book it.`,
  sickCallPush: (name: string, shift: string, date: string) =>
    `🤒 *${name}* called in sick (${shift} on ${date}). I'm already looking for cover — please confirm the sick call in the dashboard or by email.`,
}

// Same shape as `en`, enforced by the type — adding a string in one language
// without the other fails the build.
const de: typeof en = {
  confirmYes: "✅ Ja, machen",
  confirmNo: "❌ Abbrechen",
  shallI: "Soll ich?",
  unknownTool: (name) => `Das Werkzeug „${name}“ kenne ich nicht.`,
  missingParams: (details) => `Da fehlen mir Angaben: ${details}`,
  nothingToConfirm: "Da ist nichts (mehr) offen zum Bestätigen.",
  cannotRunAnymore: "Diese Aktion kann ich nicht mehr ausführen.",
  declined: "Okay, verworfen — nichts wurde geändert. 👍",
  nothingWasPending: "Da war nichts (mehr) offen.",
  nothingToUndo: "Ich finde nichts, das ich rückgängig machen könnte.",
  cannotUndoThat: "Diese Aktion lässt sich nicht rückgängig machen.",
  undone: (preview) => `↩️ Rückgängig gemacht („${preview}“).`,
  undoPrefix: (preview) => `↩️ Rückgängig: ${preview}`,

  noShiftMatch: "Ich finde keine passende Schicht.",
  ambiguousShift: (options) => `Das ist nicht eindeutig — gefunden: ${options}. Welche meinst du?`,

  releaseShift: "Schicht wieder freigeben",
  shiftBackTo: (name) => `Schicht zurück an ${name}`,
  previousPerson: "vorherige Person",
  removeVacationAgain: "Urlaub wieder entfernen",
  restoreVacation: "Urlaub wiederherstellen",
  deleteRuleAgain: "Regel wieder löschen",
  restoreRule: "Regel wiederherstellen",
  removePersonAgain: (name) => `${name} wieder entfernen`,
  somebody: "die Person",
  resetEmployee: "Mitarbeiterdaten zurücksetzen",

  noPlanForWeek: (date) => `Für die Woche ab ${date} gibt es keinen Plan.`,
  personNotFound: "Diese Person finde ich nicht.",
  shiftOrPersonGone: "Schicht oder Person nicht (mehr) gefunden.",
  shiftGone: "Schicht nicht (mehr) gefunden.",

  takesOver: (name, label) => `${name} übernimmt: ${label}`,
  insteadOf: (name) => ` (statt ${name})`,
  overrideAnyway: (warning, name, label) => `⚠️ ${warning} — ${name} trotzdem zuweisen (${label})?`,
  reassigned: (name, label, prev) =>
    `✅ ${name} übernimmt: ${label}${prev ? ` (statt ${prev})` : ""}. Die Benachrichtigungen sind raus.`,
  shiftNotAssigned: "Diese Schicht ist gar nicht besetzt.",
  takeOffShift: (name, label) => `${name} von der Schicht nehmen: ${label}`,
  unassigned: (name) =>
    `✅ ${name} ist von der Schicht runter — sie ist jetzt offen. Sag mir, wer übernehmen soll, oder frag nach offenen Schichten.`,

  generateDraft: "Neuen Wochenplan erstellen",
  generating:
    "🛠️ Ich erstelle den Entwurf — das dauert einen Moment. Ich melde mich hier, sobald er fertig ist.",
  noDraftToPublish: "Es gibt gerade keinen Entwurf zum Veröffentlichen.",
  publishPreview: (date, total, open) =>
    `Plan für die Woche ab ${date} veröffentlichen — ${total} Schichten${open > 0 ? `, davon ${open} noch offen` : ""}. Alle Mitarbeitenden werden benachrichtigt.`,
  publishFailed: "Das hat nicht geklappt — ist der Entwurf noch da?",
  published: (date) =>
    `📣 Der Plan für die Woche ab ${date} ist raus! Alle Mitarbeitenden bekommen jetzt ihre Schichten. Ich sammle die Zu-/Absagen ein und melde mich bei Problemen.`,

  noUpcomingShift: (name) => `${name} hat keine passende anstehende Schicht.`,
  whichShiftSick: (name, options) => `${name} hat mehrere Schichten — welche? ${options}`,
  sickPreview: (name, label) => `${name} krankmelden für ${label}`,
  shiftAlreadyHandled: "Die Schicht ist inzwischen schon anderweitig behandelt.",
  sickReported: (name) =>
    `🤒 Gute Besserung an ${name}! Die Schicht ist freigegeben und ich suche schon nach Ersatz — ich melde mich, sobald jemand übernimmt.`,

  couldNotParseRule: "Das konnte ich nicht als Regel lesen.",
  newRule: (plain) => `Neue Regel: „${plain}“`,
  ruleSaved: (plain) => `✅ Regel gespeichert: ${plain} — sie gilt ab der nächsten Planerstellung.`,
  ruleNotFound: "Diese Regel finde ich nicht.",
  ruleNotFoundAnymore: "Diese Regel finde ich nicht (mehr).",
  deleteRulePreview: (plain) => `Regel löschen: „${plain}“`,
  ruleDeleted: (plain) => `🗑️ Regel gelöscht: „${plain}“.`,
  restoreRulePreview: (plain) => `Regel wiederherstellen: „${plain}“`,
  ruleRestored: (plain) => `✅ Regel wiederhergestellt: „${plain}“.`,

  whoseVacation: "Für wen ist der Urlaub?",
  vacationPreview: (name, start, end) => `Urlaub für ${name}: ${start} bis ${end}`,
  vacationSaved: (name, start, end) => `🏖️ Urlaub eingetragen für ${name}: ${start} bis ${end}.`,
  vacationNotFound: "Diesen Urlaub finde ich nicht.",
  vacationNotFoundAnymore: "Diesen Urlaub finde ich nicht (mehr).",
  severalVacations: (name) => `${name} hat mehrere Urlaube — nutze list_vacations und gib die id an.`,
  deleteVacationPreview: (name, range) => `Urlaub löschen: ${name}, ${range}`,
  vacationDeleted: (name, range) => `🗑️ Urlaub von ${name} (${range}) gelöscht.`,

  createEmployeePreview: (name, category) => `${name} anlegen (${category})`,
  employeeCreated: (name) =>
    `✅ ${name} ist im Team! Sag Bescheid, wenn ich die Verfügbarkeits-Abfrage per E-Mail schicken soll.`,
  whoToChange: "Wen soll ich ändern?",
  whatToChange: "Was genau soll ich ändern?",
  changePreview: (name, changes) => `${name} ändern: ${changes}`,
  employeeUpdated: (name) => `✅ ${name} ist aktualisiert.`,
  whoToRemove: "Wen soll ich entfernen?",
  deleteEmployeePreview: (name, upcoming) =>
    `${name} ENDGÜLTIG aus dem Team entfernen${upcoming > 0 ? ` — ${upcoming} anstehende Schicht(en) werden frei` : ""}. Das kann ich nicht rückgängig machen.`,
  deleteFailed: "Das hat nicht geklappt — die Person ist noch da.",
  employeeDeleted: (name) => `🗑️ ${name} wurde aus dem Team entfernt.`,
  categoryLabel: (cat) => (cat === "TEILZEIT_FEST" ? "Fest/Teilzeit" : "Minijob"),

  llmDown:
    "Gerade komme ich nicht an mein Sprachmodell. Du kannst mich trotzdem Dinge fragen wie *„Wer arbeitet Freitag?“* oder *„Erstelle den Plan“* — versuch es gleich nochmal.",
  lost: "Da habe ich mich verlaufen 😅 — magst du es nochmal anders formulieren?",
  howCanIHelp: "Wie kann ich helfen? ☕",

  draftReady: (date, filled, total, open, dropped) =>
    `🛠️ Der Entwurf für die Woche ab ${date} ist fertig: ${filled}/${total} Schichten besetzt${open > 0 ? `, ${open} noch offen` : ""}${dropped ? ` (${dropped} ohne Verfügbarkeits-Bestätigung ausgelassen)` : ""}. Sag *„veröffentlichen“*, wenn er passt.`,
  replacementFound: (name, shift, date, time, forWhom) =>
    `✅ Ersatz gefunden: *${name}* übernimmt die ${shift}-Schicht am ${date} (${time})${forWhom ? ` für ${forWhom}` : ""}.`,
  replacementFailed: (shift, date, tried) =>
    `⚠️ Für die ${shift}-Schicht am ${date} habe ich niemanden gefunden — ${tried} Personen gefragt, alle abgesagt oder keine Antwort. Sag mir, wer einspringen soll, dann trage ich es ein.`,
  sickCallPush: (name, shift, date) =>
    `🤒 *${name}* hat sich krankgemeldet (${shift} am ${date}). Ich suche bereits Ersatz — bitte bestätige die Krankmeldung im Dashboard oder per E-Mail.`,
}

const CATALOG: Record<Lang, typeof en> = { en, de }

export const t = (lang: Lang) => CATALOG[lang] ?? CATALOG.en

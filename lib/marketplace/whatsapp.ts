// wa.me nudges: WhatsApp is only the transport — every actionable link in the
// message is a tokenised ShiftPilot URL, so the DB stays the source of truth.

export function buildWhatsAppUrl(message: string, phone?: string): string {
  const base = phone ? `https://wa.me/${phone}` : "https://wa.me/"
  return `${base}?text=${encodeURIComponent(message)}`
}

interface WorkerNudgeInput {
  workerName: string
  role: string
  venueName: string
  dateLabel: string
  window: string
  rateLabel: string
  acceptUrl: string
  declineUrl: string
}

// Mirrors the LoanConsentEmail: same facts, same two choices, same tokens.
export function buildWorkerNudgeMessage(input: WorkerNudgeInput): string {
  return [
    `Hi ${input.workerName}! Fancy a ${input.role} shift at ${input.venueName}?`,
    `${input.dateLabel}, ${input.window} · ${input.rateLabel}`,
    ``,
    `✅ Accept: ${input.acceptUrl}`,
    `❌ Decline: ${input.declineUrl}`,
    ``,
    `Nothing is booked until you tap accept.`,
  ].join("\n")
}

interface ManagerNudgeInput {
  role: string
  dateLabel: string
  window: string
  marketplaceUrl: string
}

// Managers confirm from their dashboard (auth-gated), exactly like the email.
export function buildManagerNudgeMessage(input: ManagerNudgeInput): string {
  return [
    `Hi! We responded to your ShiftPilot listing — ${input.role} on ${input.dateLabel}, ${input.window}.`,
    `Can you confirm or decline the deal here?`,
    input.marketplaceUrl,
  ].join("\n")
}

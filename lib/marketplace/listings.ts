// Listing input validation + display helpers. Pure — the server action parses
// FormData into ListingInput and lets this decide what's postable.

export type ListingType = "OFFER" | "REQUEST"

export interface ListingInput {
  type: ListingType
  role: string
  date: string // "YYYY-MM-DD" from the form
  startTime: string // "HH:MM"
  endTime: string // "HH:MM"
  employeeId: string | null
  hourlyRateCents: number | null
}

export interface ValidListing {
  type: ListingType
  role: string
  date: Date
  startTime: string
  endTime: string
  employeeId: string | null
  hourlyRateCents: number | null
}

export type ListingValidation =
  | { ok: true; value: ValidListing }
  | { ok: false; error: string }

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function validateListingInput(input: ListingInput, now: Date): ListingValidation {
  const role = input.role.trim()
  if (!role) return { ok: false, error: "Role is required" }

  if (input.type === "OFFER" && !input.employeeId) {
    return { ok: false, error: "An offer must name the employee you're lending" }
  }

  const date = new Date(`${input.date}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return { ok: false, error: "Invalid date" }

  const todayUtc = new Date(now)
  todayUtc.setUTCHours(0, 0, 0, 0)
  if (date < todayUtc) return { ok: false, error: "Date can't be in the past" }

  if (!TIME_RE.test(input.startTime) || !TIME_RE.test(input.endTime)) {
    return { ok: false, error: "Times must be HH:MM" }
  }
  if (input.endTime <= input.startTime) {
    return { ok: false, error: "The window must end after it starts" }
  }

  if (input.hourlyRateCents !== null && input.hourlyRateCents <= 0) {
    return { ok: false, error: "Rate must be positive, or leave it blank for negotiable" }
  }

  return {
    ok: true,
    value: {
      type: input.type,
      role,
      date,
      startTime: input.startTime,
      endTime: input.endTime,
      employeeId: input.type === "OFFER" ? input.employeeId : null,
      hourlyRateCents: input.hourlyRateCents,
    },
  }
}

export function formatRate(cents: number | null): string {
  if (cents === null) return "Negotiable"
  const euros = cents / 100
  return Number.isInteger(euros) ? `€${euros}/h` : `€${euros.toFixed(2)}/h`
}

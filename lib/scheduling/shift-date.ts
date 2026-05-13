// Helpers for working with a Shift's real date (computed from Schedule.weekStart + dayOfWeek)
// and for producing a Google Calendar "add event" link.

export function getShiftStart(weekStart: Date, dayOfWeek: number, startTime: string): Date {
  const d = new Date(weekStart)
  // weekStart is always Monday — dayOfWeek 1=Mon offset 0 … 0=Sun offset 6
  const offset = (dayOfWeek + 6) % 7
  d.setDate(d.getDate() + offset)
  const [h, m] = startTime.split(":").map(Number)
  d.setHours(h, m, 0, 0)
  return d
}

export function getShiftEnd(weekStart: Date, dayOfWeek: number, endTime: string): Date {
  const d = new Date(weekStart)
  const offset = (dayOfWeek + 6) % 7
  d.setDate(d.getDate() + offset)
  const [h, m] = endTime.split(":").map(Number)
  d.setHours(h, m, 0, 0)
  return d
}

export function formatShiftDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })
}

// Google Calendar render URL format:
// https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=YYYYMMDDTHHmmssZ/YYYYMMDDTHHmmssZ&details=...&location=...
function toGCalDate(d: Date): string {
  // YYYYMMDDTHHmmssZ in UTC
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    "00Z"
  )
}

export function buildGoogleCalendarUrl(opts: {
  title: string
  start: Date
  end: Date
  description?: string
  location?: string
}): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${toGCalDate(opts.start)}/${toGCalDate(opts.end)}`,
  })
  if (opts.description) params.set("details", opts.description)
  if (opts.location) params.set("location", opts.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

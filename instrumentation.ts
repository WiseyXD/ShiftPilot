// Pin the server's timezone to the café's.
//
// Every shift time in this app is a naive wall clock: Schedule.weekStart is
// written as LOCAL midnight Monday, and getShiftStart/getShiftEnd (plus the
// whole compliance engine — dayKey, minutesOfDay, the JArbSchG night cutoff)
// read those Dates back with LOCAL getters. That is self-consistent only if the
// process runs in the café's timezone.
//
// Vercel's Node runtime runs in UTC and ignores the TZ env var, so in
// production every shift date slid back a day: a Tuesday Abendschicht was
// announced to staff as Monday, and the compliance rules were evaluated against
// the wrong day. Node re-reads process.env.TZ when it changes, and Next runs
// register() before any request is served, so setting it here fixes the whole
// process.
//
// This is correct while ShiftPilot is single-market (German labour law, one
// timezone). The day a location sits in another timezone, this has to become a
// per-location conversion at the boundary instead — the naive-wall-clock model
// itself is the thing that would need to go.
export async function register() {
  process.env.TZ = "Europe/Berlin"
}

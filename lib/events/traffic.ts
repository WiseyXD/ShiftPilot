// Pure heuristic: turn a count of nearby same-day events into a traffic
// estimate for the venue. No external calls — kept separate from
// lib/events/client.ts so it's cheap to unit test.

export type TrafficLevel = "normal" | "elevated" | "high"

export interface TrafficEstimate {
  level: TrafficLevel
  label: string
}

export function estimateTraffic(nearbyEventCount: number): TrafficEstimate {
  if (nearbyEventCount >= 3) {
    return { level: "high", label: `${nearbyEventCount} events nearby today — expect a busy footfall` }
  }
  if (nearbyEventCount >= 1) {
    return { level: "elevated", label: `${nearbyEventCount} event${nearbyEventCount > 1 ? "s" : ""} nearby today — traffic may be a little higher` }
  }
  return { level: "normal", label: "No major events nearby today" }
}

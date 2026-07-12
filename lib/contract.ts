// One color scheme for employment contract (EmployeeCategory), shared by every
// place team members show up — roster, dashboard, schedule grid, chat — so a
// Minijobber vs a Festangestellte reads the same everywhere.
//
// Minijob   → amber   (availability-bound, can decline)
// Festang.  → indigo  (freely assignable, cannot decline)

export const CONTRACT = {
  MINIJOB_ZEITARBEIT: {
    label: "Minijob",
    dot: "bg-amber-500",
    text: "text-amber-700",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    borderL: "border-l-amber-400",
  },
  TEILZEIT_FEST: {
    label: "Festangestellt",
    dot: "bg-indigo-500",
    text: "text-indigo-700",
    badge: "bg-indigo-100 text-indigo-700 border-indigo-200",
    borderL: "border-l-indigo-400",
  },
} as const

export type ContractStyle = (typeof CONTRACT)[keyof typeof CONTRACT]

// The style for a category, or null when it's unknown/unassigned (no colour).
export function contractStyle(category?: string | null): ContractStyle | null {
  if (category === "TEILZEIT_FEST") return CONTRACT.TEILZEIT_FEST
  if (category === "MINIJOB_ZEITARBEIT") return CONTRACT.MINIJOB_ZEITARBEIT
  return null
}

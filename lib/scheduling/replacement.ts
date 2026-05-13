export interface CandidateEmployee {
  id: string
  name: string
  roles: string[]
  minHours: number
  maxHours: number
  assignedHoursThisWeek: number
  hasVolunteeredForExtra: boolean
}

export interface ShiftInfo {
  requiredRoles: string[]
  durationHours: number
  dayOfWeek: number
}

export interface AvailableSlot {
  employeeId: string
  dayOfWeek: number
  available: boolean
}

export type CandidatePriority = 1 | 2 | 3

export interface RankedCandidate {
  employeeId: string
  priority: CandidatePriority
  fairnessScore: number // lower = more fair (fewer assigned hours relative to max)
}

// Builds a priority-ordered candidate list for replacing a declined/sick shift.
// Priority 1: volunteers for extra shifts
// Priority 2: employees under their minimum contracted hours
// Priority 3: available + role-matched, ranked by fairness
export function rankReplacementCandidates(
  employees: CandidateEmployee[],
  shift: ShiftInfo,
  availability: AvailableSlot[],
  excludeEmployeeId: string
): RankedCandidate[] {
  const availableSet = new Set(
    availability
      .filter((a) => a.available && a.dayOfWeek === shift.dayOfWeek)
      .map((a) => a.employeeId)
  )

  const eligible = employees.filter((emp) => {
    if (emp.id === excludeEmployeeId) return false
    if (!availableSet.has(emp.id)) return false
    if (emp.assignedHoursThisWeek + shift.durationHours > emp.maxHours) return false
    if (
      shift.requiredRoles.length > 0 &&
      !shift.requiredRoles.some((r) => emp.roles.includes(r))
    )
      return false
    return true
  })

  return eligible
    .map((emp): RankedCandidate => {
      let priority: CandidatePriority = 3
      if (emp.hasVolunteeredForExtra) priority = 1
      else if (emp.assignedHoursThisWeek < emp.minHours) priority = 2

      const fairnessScore = emp.assignedHoursThisWeek / (emp.maxHours || 1)

      return { employeeId: emp.id, priority, fairnessScore }
    })
    .sort((a, b) => a.priority - b.priority || a.fairnessScore - b.fairnessScore)
}

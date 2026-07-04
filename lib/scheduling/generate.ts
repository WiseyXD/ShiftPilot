import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"
import type { EffectiveAvailability } from "./availability"
import type { EmployeeCategory } from "@/prisma/generated/client/client"
import { isAssignable, needsAvailability } from "./categories"
import { isBlocked, slotKey, type Pin, type Block } from "./pins"
import { checkEmployeeAssignment, type PlannedShift } from "@/lib/compliance/check"
import { DEFAULT_COMPLIANCE_RULES, type ComplianceRules } from "@/lib/compliance/rules"
import { getShiftStart, getShiftEnd } from "./shift-date"

// Nominal week for legal math — generation reasons about a week shape, not a
// calendar date. 2001-01-01 is a Monday.
const NOMINAL_MONDAY = new Date(2001, 0, 1)

const slotShift = (dayOfWeek: number, tmpl: { startTime: string; endTime: string }): PlannedShift => ({
  start: getShiftStart(NOMINAL_MONDAY, dayOfWeek, tmpl.startTime),
  end: getShiftEnd(NOMINAL_MONDAY, dayOfWeek, tmpl.endTime),
})

interface Employee {
  id: string
  name: string
  roles: string[]
  minHours: number
  maxHours: number
  category: EmployeeCategory
  birthDate?: Date | string | null
  hourlyWageCents?: number | null
  isWerkstudent?: boolean
  lectureFree?: boolean
}

// Net hours already worked earlier this month, per employee — for the Minijob cap.
export type MonthHours = Record<string, number>

export interface GenerateOptions {
  rules?: ComplianceRules
  monthHours?: MonthHours
  /** Pre-filtered for the target week (see pinsForWeek). Priority 2. */
  pins?: Pin[]
  /** Sperrzeiten — hard exclusions. */
  blocks?: Block[]
}

// Pin seeding shared by both paths: validate each pin against blocks and the
// law; a valid pin owns its slot, an invalid one becomes a conflict message.
function seedPins(
  templates: ShiftTemplate[],
  employees: Employee[],
  opts: Required<Pick<GenerateOptions, "rules" | "monthHours" | "pins" | "blocks">>
): {
  pinnedBySlot: Map<string, string> // slotKey → employeeId
  assignedShifts: Record<string, PlannedShift[]>
  assignedHours: Record<string, number>
  conflicts: string[]
} {
  const { rules, monthHours, pins, blocks } = opts
  const byId = new Map(employees.map((e) => [e.id, e]))
  const tmplById = new Map(templates.map((t) => [t.id, t]))
  const pinnedBySlot = new Map<string, string>()
  const assignedShifts: Record<string, PlannedShift[]> = {}
  const assignedHours: Record<string, number> = {}
  const conflicts: string[] = []

  for (const pin of pins) {
    const emp = byId.get(pin.employeeId)
    const tmpl = tmplById.get(pin.shiftTemplateId)
    if (!emp || !tmpl) {
      conflicts.push(`pin ${pin.employeeId}@${pin.shiftTemplateId}: employee or template no longer exists`)
      continue
    }
    const key = slotKey(pin.shiftTemplateId, pin.dayOfWeek)
    if (pinnedBySlot.has(key)) {
      conflicts.push(`${emp.name}: slot already pinned to someone else (day ${pin.dayOfWeek})`)
      continue
    }
    if (isBlocked(blocks, emp.id, pin.shiftTemplateId, pin.dayOfWeek)) {
      conflicts.push(`${emp.name}: pin on day ${pin.dayOfWeek} collides with a Sperrzeit`)
      continue
    }
    const slot = slotShift(pin.dayOfWeek, tmpl)
    const violation = checkEmployeeAssignment(emp, slot, assignedShifts[emp.id] ?? [], rules, {
      monthNetHoursBeforeWeek: monthHours[emp.id] ?? 0,
    })
    if (violation) {
      conflicts.push(`${emp.name}: pin on day ${pin.dayOfWeek} rejected — ${violation.rule}: ${violation.detail}`)
      continue
    }
    pinnedBySlot.set(key, emp.id)
    ;(assignedShifts[emp.id] ??= []).push(slot)
    assignedHours[emp.id] = (assignedHours[emp.id] ?? 0) + shiftHours(tmpl)
  }

  return { pinnedBySlot, assignedShifts, assignedHours, conflicts }
}

interface ShiftTemplate {
  id: string
  name: string
  startTime: string
  endTime: string
  minHeadcount: number
  requiredRoles: string[]
}

export interface GeneratedAssignment {
  shiftTemplateId: string
  dayOfWeek: number
  employeeId: string | null
  filled: boolean
}

const assignmentSchema = z.object({
  assignments: z.array(
    z.object({
      shiftTemplateId: z.string(),
      dayOfWeek: z.number().int().min(0).max(6),
      employeeId: z.string().nullable(),
    })
  ),
  reasoning: z.string(),
})

function shiftHours(template: ShiftTemplate): number {
  const [sh, sm] = template.startTime.split(":").map(Number)
  const [eh, em] = template.endTime.split(":").map(Number)
  return (eh * 60 + em - (sh * 60 + sm)) / 60
}

// Deterministic fallback: role-aware round-robin. Exported for tests.
export function fallbackAssign(
  templates: ShiftTemplate[],
  employees: Employee[],
  availability: EffectiveAvailability[],
  options: GenerateOptions = {}
): { assignments: GeneratedAssignment[]; conflicts: string[] } {
  const rules = options.rules ?? DEFAULT_COMPLIANCE_RULES
  const monthHours = options.monthHours ?? {}
  const blocks = options.blocks ?? []
  const availSet = new Set(
    availability.filter((a) => a.available).map((a) => `${a.employeeId}:${a.shiftTemplateId}:${a.dayOfWeek}`)
  )

  // Pins claim their slots first — priority 2, only legal limits override.
  const { pinnedBySlot, assignedShifts, assignedHours, conflicts } = seedPins(templates, employees, {
    rules,
    monthHours,
    pins: options.pins ?? [],
    blocks,
  })
  const results: GeneratedAssignment[] = []

  // Each template × each day of week
  for (const tmpl of templates) {
    const hours = shiftHours(tmpl)
    for (let day = 0; day < 7; day++) {
      const pinned = pinnedBySlot.get(slotKey(tmpl.id, day))
      if (pinned) {
        results.push({ shiftTemplateId: tmpl.id, dayOfWeek: day, employeeId: pinned, filled: true })
        continue
      }

      const slot = slotShift(day, tmpl)
      const eligible = employees.filter((emp) => {
        // Sperrzeiten are hard exclusions.
        if (isBlocked(blocks, emp.id, tmpl.id, day)) return false
        // Category A only within availability; category B freely assignable
        if (!isAssignable(emp.category, availSet.has(`${emp.id}:${tmpl.id}:${day}`))) return false
        const current = assignedHours[emp.id] ?? 0
        if (current + hours > emp.maxHours) return false
        if (tmpl.requiredRoles.length > 0 && !tmpl.requiredRoles.some((r) => emp.roles.includes(r))) return false
        // Legal limits are priority 1 — never violable.
        if (
          checkEmployeeAssignment(emp, slot, assignedShifts[emp.id] ?? [], rules, {
            monthNetHoursBeforeWeek: monthHours[emp.id] ?? 0,
          }) !== null
        )
          return false
        return true
      })

      if (eligible.length === 0) {
        results.push({ shiftTemplateId: tmpl.id, dayOfWeek: day, employeeId: null, filled: false })
        continue
      }

      // Pick the employee with fewest assigned hours
      eligible.sort((a, b) => (assignedHours[a.id] ?? 0) - (assignedHours[b.id] ?? 0))
      const chosen = eligible[0]
      assignedHours[chosen.id] = (assignedHours[chosen.id] ?? 0) + hours
      ;(assignedShifts[chosen.id] ??= []).push(slot)
      results.push({ shiftTemplateId: tmpl.id, dayOfWeek: day, employeeId: chosen.id, filled: true })
    }
  }

  return { assignments: results, conflicts }
}

export async function generateSchedule(
  templates: ShiftTemplate[],
  employees: Employee[],
  availability: EffectiveAvailability[],
  options: GenerateOptions = {}
): Promise<{ assignments: GeneratedAssignment[]; reasoning: string }> {
  const rules = options.rules ?? DEFAULT_COMPLIANCE_RULES
  const monthHours = options.monthHours ?? {}
  const pins = options.pins ?? []
  const blocks = options.blocks ?? []
  try {
    const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0 })
    const structured = model.withStructuredOutput(assignmentSchema)

    const availMatrix = employees.map((emp) => ({
      id: emp.id,
      name: emp.name,
      roles: emp.roles,
      minHours: emp.minHours,
      maxHours: emp.maxHours,
      category: emp.category,
      freelyAssignable: !needsAvailability(emp.category),
      availableSlots: availability
        .filter((a) => a.employeeId === emp.id && a.available)
        .map((a) => `${a.shiftTemplateId}:day${a.dayOfWeek}`),
    }))

    const result = await structured.invoke(`
You are a shift scheduler. Generate a weekly schedule that:
1. Assigns MINIJOB_ZEITARBEIT employees ONLY to slots listed in their availableSlots (hard rule). TEILZEIT_FEST employees (freelyAssignable: true) may be assigned to any slot regardless of availableSlots.
2. Respects each employee's min/max weekly hours
3. Only assigns employees who have the required role for the shift
4. Distributes shifts fairly (balance hours across employees)
5. Fills every shift template for every day of the week (days 0-6, 0=Sunday)
6. German working-time law applies: at most ${rules.arbzg.maxDailyHours}h net per day and ${rules.arbzg.maxWeeklyHours}h net per week per employee (minors 15-17: ${rules.jarbschg.maxDailyHours}h/${rules.jarbschg.maxWeeklyHours}h, no Sundays, done by ${rules.jarbschg.nightEndGastro16Plus}), and at least ${rules.arbzg.minRestHours}h rest between shifts on consecutive days. Violations will be voided by the system.
7. PINNED slots (templateId:dayN → employeeId) MUST be assigned exactly as given: ${JSON.stringify(pins.map((p) => `${p.shiftTemplateId}:day${p.dayOfWeek}→${p.employeeId}`))}
8. BLOCKED (employee never works these): ${JSON.stringify(blocks.map((b) => `${b.employeeId}@${b.shiftTemplateId ?? "any"}:day${b.dayOfWeek}`))}

Shift templates:
${JSON.stringify(templates, null, 2)}

Employees (with availability slots as "templateId:dayN"):
${JSON.stringify(availMatrix, null, 2)}

Return one assignment per (shiftTemplateId, dayOfWeek) combination (${templates.length * 7} total).
Set employeeId to null if no eligible employee is available.
`)

    // Deterministic repair: the LLM proposes, code guarantees. Pins are forced
    // onto their slots; voided (not shipped): blocked assignments, category-A
    // outside availability, and anything violating working-time law.
    const availSet = new Set(
      availability.filter((a) => a.available).map((a) => `${a.employeeId}:${a.shiftTemplateId}:${a.dayOfWeek}`)
    )
    const byId = new Map(employees.map((e) => [e.id, e]))
    const tmplById = new Map(templates.map((t) => [t.id, t]))
    const { pinnedBySlot, assignedShifts: acceptedShifts, conflicts } = seedPins(templates, employees, {
      rules,
      monthHours,
      pins,
      blocks,
    })
    const voided: string[] = [...conflicts]

    const assignments: GeneratedAssignment[] = result.assignments.map((a) => {
      const tmpl = tmplById.get(a.shiftTemplateId)

      // A pinned slot belongs to the pinned employee, whatever the LLM said.
      const pinned = pinnedBySlot.get(slotKey(a.shiftTemplateId, a.dayOfWeek))
      if (pinned) {
        return { shiftTemplateId: a.shiftTemplateId, dayOfWeek: a.dayOfWeek, employeeId: pinned, filled: true }
      }

      const emp = a.employeeId ? byId.get(a.employeeId) : undefined
      let employeeId = a.employeeId

      if (emp && tmpl) {
        if (isBlocked(blocks, emp.id, a.shiftTemplateId, a.dayOfWeek)) {
          voided.push(`${emp.name}: Sperrzeit (day ${a.dayOfWeek})`)
          employeeId = null
        } else if (!isAssignable(emp.category, availSet.has(`${emp.id}:${a.shiftTemplateId}:${a.dayOfWeek}`))) {
          voided.push(`${emp.name}: outside availability (day ${a.dayOfWeek})`)
          employeeId = null
        } else {
          const slot = slotShift(a.dayOfWeek, tmpl)
          const violation = checkEmployeeAssignment(emp, slot, acceptedShifts[emp.id] ?? [], rules, {
            monthNetHoursBeforeWeek: monthHours[emp.id] ?? 0,
          })
          if (violation) {
            voided.push(`${emp.name}: ${violation.rule} — ${violation.detail}`)
            employeeId = null
          } else {
            ;(acceptedShifts[emp.id] ??= []).push(slot)
          }
        }
      } else if (!tmpl) {
        employeeId = null
      }

      return { shiftTemplateId: a.shiftTemplateId, dayOfWeek: a.dayOfWeek, employeeId, filled: employeeId !== null }
    })

    const reasoning =
      voided.length > 0
        ? `${result.reasoning}\n[compliance] ${voided.length} note(s): ${voided.join("; ")}`
        : result.reasoning

    return { assignments, reasoning }
  } catch {
    // Fallback to deterministic algorithm if LLM fails
    const { assignments, conflicts } = fallbackAssign(templates, employees, availability, options)
    return {
      assignments,
      reasoning:
        conflicts.length > 0
          ? `Deterministic fallback (LLM unavailable)\n[compliance] ${conflicts.join("; ")}`
          : "Deterministic fallback (LLM unavailable)",
    }
  }
}

import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"
import type { EffectiveAvailability } from "./availability"
import type { EmployeeCategory } from "@/prisma/generated/client/client"
import { isAssignable, needsAvailability } from "./categories"
import { checkAssignment, type PlannedShift } from "@/lib/compliance/arbzg"
import { DEFAULT_ARBZG_RULES, type ArbZGRules } from "@/lib/compliance/rules"
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
  rules: ArbZGRules = DEFAULT_ARBZG_RULES
): GeneratedAssignment[] {
  const availSet = new Set(
    availability.filter((a) => a.available).map((a) => `${a.employeeId}:${a.shiftTemplateId}:${a.dayOfWeek}`)
  )

  const assignedHours: Record<string, number> = {}
  const assignedShifts: Record<string, PlannedShift[]> = {}
  const results: GeneratedAssignment[] = []

  // Each template × each day of week
  for (const tmpl of templates) {
    const hours = shiftHours(tmpl)
    for (let day = 0; day < 7; day++) {
      const slot = slotShift(day, tmpl)
      const eligible = employees.filter((emp) => {
        // Category A only within availability; category B freely assignable
        if (!isAssignable(emp.category, availSet.has(`${emp.id}:${tmpl.id}:${day}`))) return false
        const current = assignedHours[emp.id] ?? 0
        if (current + hours > emp.maxHours) return false
        if (tmpl.requiredRoles.length > 0 && !tmpl.requiredRoles.some((r) => emp.roles.includes(r))) return false
        // Legal limits are priority 1 — never violable.
        if (checkAssignment(slot, assignedShifts[emp.id] ?? [], rules) !== null) return false
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

  return results
}

export async function generateSchedule(
  templates: ShiftTemplate[],
  employees: Employee[],
  availability: EffectiveAvailability[],
  rules: ArbZGRules = DEFAULT_ARBZG_RULES
): Promise<{ assignments: GeneratedAssignment[]; reasoning: string }> {
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
6. German working-time law applies: at most ${rules.maxDailyHours}h net per day and ${rules.maxWeeklyHours}h net per week per employee, and at least ${rules.minRestHours}h rest between shifts on consecutive days. Violations will be voided by the system.

Shift templates:
${JSON.stringify(templates, null, 2)}

Employees (with availability slots as "templateId:dayN"):
${JSON.stringify(availMatrix, null, 2)}

Return one assignment per (shiftTemplateId, dayOfWeek) combination (${templates.length * 7} total).
Set employeeId to null if no eligible employee is available.
`)

    // Deterministic repair: the LLM proposes, code guarantees. Voided (not
    // shipped): category-A assignments outside availability, and anything
    // violating working-time law.
    const availSet = new Set(
      availability.filter((a) => a.available).map((a) => `${a.employeeId}:${a.shiftTemplateId}:${a.dayOfWeek}`)
    )
    const byId = new Map(employees.map((e) => [e.id, e]))
    const tmplById = new Map(templates.map((t) => [t.id, t]))
    const acceptedShifts: Record<string, PlannedShift[]> = {}
    const voided: string[] = []

    const assignments: GeneratedAssignment[] = result.assignments.map((a) => {
      const emp = a.employeeId ? byId.get(a.employeeId) : undefined
      const tmpl = tmplById.get(a.shiftTemplateId)
      let employeeId = a.employeeId

      if (emp && tmpl) {
        if (!isAssignable(emp.category, availSet.has(`${emp.id}:${a.shiftTemplateId}:${a.dayOfWeek}`))) {
          voided.push(`${emp.name}: outside availability (day ${a.dayOfWeek})`)
          employeeId = null
        } else {
          const slot = slotShift(a.dayOfWeek, tmpl)
          const violation = checkAssignment(slot, acceptedShifts[emp.id] ?? [], rules)
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
        ? `${result.reasoning}\n[compliance] voided ${voided.length} assignment(s): ${voided.join("; ")}`
        : result.reasoning

    return { assignments, reasoning }
  } catch {
    // Fallback to deterministic algorithm if LLM fails
    const assignments = fallbackAssign(templates, employees, availability, rules)
    return { assignments, reasoning: "Deterministic fallback (LLM unavailable)" }
  }
}

import { ChatOpenAI } from "@langchain/openai"
import { z } from "zod"
import type { EffectiveAvailability } from "./availability"
import type { EmployeeCategory } from "@/prisma/generated/client/client"
import { isAssignable, needsAvailability } from "./categories"
import { isBlocked, slotKey, type Pin, type Block } from "./pins"
import { isOnVacation, type VacationRange } from "./vacation"
import {
  neverTogetherViolated,
  maxShiftsReached,
  dayPreference,
  type StructuredRule,
} from "./manager-rules"
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
  wishWeight?: "LOW" | "MEDIUM" | "HIGH"
}

const WISH_SCORE = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const

// Net hours already worked earlier this month, per employee — for the Minijob cap.
export type MonthHours = Record<string, number>

export interface GenerateOptions {
  rules?: ComplianceRules
  monthHours?: MonthHours
  /** Pre-filtered for the target week (see pinsForWeek). Priority 2. */
  pins?: Pin[]
  /** Sperrzeiten — hard exclusions. */
  blocks?: Block[]
  /** Absence ranges; needs weekStart to resolve real shift dates. */
  vacations?: VacationRange[]
  /** Structured manager rules (hierarchy level 5). */
  managerRules?: StructuredRule[]
  /** Real Monday of the target week — enables date-based checks (vacations). */
  weekStart?: Date
}

// Real calendar date of a slot when the caller supplied weekStart; null in
// nominal-week mode (tests, previews) where date-based checks are inert.
const realShiftDate = (
  weekStart: Date | undefined,
  dayOfWeek: number,
  tmpl: { startTime: string }
): Date | null => (weekStart ? getShiftStart(new Date(weekStart), dayOfWeek, tmpl.startTime) : null)

const onVacationForSlot = (
  options: GenerateOptions,
  employeeId: string,
  dayOfWeek: number,
  tmpl: { startTime: string }
): boolean => {
  if (!options.vacations || options.vacations.length === 0) return false
  const date = realShiftDate(options.weekStart, dayOfWeek, tmpl)
  return date !== null && isOnVacation(options.vacations, employeeId, date)
}

// Pin seeding shared by both paths: validate each pin against blocks and the
// law; a valid pin owns its slot, an invalid one becomes a conflict message.
function seedPins(
  templates: ShiftTemplate[],
  employees: Employee[],
  opts: Required<Pick<GenerateOptions, "rules" | "monthHours" | "pins" | "blocks">> &
    Pick<GenerateOptions, "vacations" | "weekStart">
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
    if (onVacationForSlot(opts, emp.id, pin.dayOfWeek, tmpl)) {
      conflicts.push(`${emp.name}: pin on day ${pin.dayOfWeek} collides with a vacation`)
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
  const managerRules = options.managerRules ?? []
  const assignmentCounts: Record<string, number> = {}
  const availSet = new Set(
    availability.filter((a) => a.available).map((a) => `${a.employeeId}:${a.shiftTemplateId}:${a.dayOfWeek}`)
  )

  // Pins claim their slots first — priority 2, only legal limits override.
  const { pinnedBySlot, assignedShifts, assignedHours, conflicts } = seedPins(templates, employees, {
    rules,
    monthHours,
    pins: options.pins ?? [],
    blocks,
    vacations: options.vacations,
    weekStart: options.weekStart,
  })
  const results: GeneratedAssignment[] = []

  // Each template × each day of week
  for (const tmpl of templates) {
    const hours = shiftHours(tmpl)
    for (let day = 0; day < 7; day++) {
      const need = Math.max(1, tmpl.minHeadcount)
      const slot = slotShift(day, tmpl)
      const takenThisSlot = new Set<string>()

      // A pin claims one of the slot's seats (its hours were booked in seedPins).
      const pinned = pinnedBySlot.get(slotKey(tmpl.id, day))
      if (pinned) {
        results.push({ shiftTemplateId: tmpl.id, dayOfWeek: day, employeeId: pinned, filled: true })
        takenThisSlot.add(pinned)
      }

      // First blocking level per employee — doubles as the unfilled-slot
      // explanation (hierarchy levels, doc §3).
      const blockingReason = (emp: Employee): string | null => {
        if (isBlocked(blocks, emp.id, tmpl.id, day)) return "Sperrzeit"
        if (onVacationForSlot(options, emp.id, day, tmpl)) return "vacation"
        if (!isAssignable(emp.category, availSet.has(`${emp.id}:${tmpl.id}:${day}`)))
          return "availability (category A)"
        const current = assignedHours[emp.id] ?? 0
        if (current + hours > emp.maxHours) return "max contract hours"
        if (tmpl.requiredRoles.length > 0 && !tmpl.requiredRoles.some((r) => emp.roles.includes(r)))
          return "missing role"
        // Manager rules — hierarchy level 5.
        if (neverTogetherViolated(managerRules, emp.id, slot, assignedShifts))
          return "manager rule (never together)"
        if (maxShiftsReached(managerRules, emp.id, assignmentCounts))
          return "manager rule (max shifts)"
        // Legal limits are priority 1 — never violable.
        const violation = checkEmployeeAssignment(emp, slot, assignedShifts[emp.id] ?? [], rules, {
          monthNetHoursBeforeWeek: monthHours[emp.id] ?? 0,
        })
        if (violation) return violation.rule
        return null
      }

      // Fill each seat (up to minHeadcount) with a distinct eligible employee.
      let lastReasons: Map<string, string> | null = null
      while (takenThisSlot.size < need) {
        const reasons = new Map<string, string>()
        const eligible = employees.filter((emp) => {
          if (takenThisSlot.has(emp.id)) return false // never twice in the same slot
          const reason = blockingReason(emp)
          if (reason) reasons.set(emp.id, reason)
          return reason === null
        })
        if (eligible.length === 0) {
          lastReasons = reasons
          break
        }

        // Selection order (levels 4 → 6 → fairness): furthest below contract
        // minimum first, then strongest wish for this slot, then fewest hours.
        eligible.sort((a, b) => {
          const deficitA = Math.max(0, a.minHours - (assignedHours[a.id] ?? 0))
          const deficitB = Math.max(0, b.minHours - (assignedHours[b.id] ?? 0))
          if (deficitB !== deficitA) return deficitB - deficitA
          // Level 5: manager day preferences outrank wishes.
          const prefA = dayPreference(managerRules, a.id, day)
          const prefB = dayPreference(managerRules, b.id, day)
          if (prefB !== prefA) return prefB - prefA
          const wishA = availSet.has(`${a.id}:${tmpl.id}:${day}`) ? WISH_SCORE[a.wishWeight ?? "MEDIUM"] : -1
          const wishB = availSet.has(`${b.id}:${tmpl.id}:${day}`) ? WISH_SCORE[b.wishWeight ?? "MEDIUM"] : -1
          if (wishB !== wishA) return wishB - wishA
          return (assignedHours[a.id] ?? 0) - (assignedHours[b.id] ?? 0)
        })
        const chosen = eligible[0]
        assignedHours[chosen.id] = (assignedHours[chosen.id] ?? 0) + hours
        assignmentCounts[chosen.id] = (assignmentCounts[chosen.id] ?? 0) + 1
        ;(assignedShifts[chosen.id] ??= []).push(slot)
        results.push({ shiftTemplateId: tmpl.id, dayOfWeek: day, employeeId: chosen.id, filled: true })
        takenThisSlot.add(chosen.id)
      }

      // Any seats we couldn't fill become open shifts, with one conflict note.
      const missing = need - takenThisSlot.size
      if (missing > 0) {
        if (employees.length > 0 && lastReasons) {
          const counts = new Map<string, number>()
          for (const r of lastReasons.values()) counts.set(r, (counts.get(r) ?? 0) + 1)
          const summary = [...counts.entries()].map(([r, n]) => `${r}×${n}`).join(", ")
          const label = need > 1 ? `${takenThisSlot.size}/${need} filled` : "unfilled"
          conflicts.push(
            summary
              ? `${tmpl.name} day ${day} ${label} — blocked by: ${summary}`
              : `${tmpl.name} day ${day} ${label} — not enough staff`
          )
        }
        for (let i = 0; i < missing; i++) {
          results.push({ shiftTemplateId: tmpl.id, dayOfWeek: day, employeeId: null, filled: false })
        }
      }
    }
  }

  // Contract-hour deviation report (feeds the hours dashboard slice).
  for (const emp of employees) {
    const got = assignedHours[emp.id] ?? 0
    if (emp.minHours > 0 && got < emp.minHours) {
      conflicts.push(`${emp.name} below contract minimum: ${got}h of ${emp.minHours}h`)
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
      wishWeight: emp.wishWeight ?? "MEDIUM",
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
4. Aims each employee at their minHours contract target; break ties by preferring slots the employee listed in availableSlots, weighted by wishWeight (HIGH > MEDIUM > LOW), then balance hours fairly
5. Fills every shift template for every day of the week (days 0-6, 0=Sunday). Each template has a minHeadcount — that many DIFFERENT employees must be assigned to that shift on that day (emit one assignment per person)
6. German working-time law applies: at most ${rules.arbzg.maxDailyHours}h net per day and ${rules.arbzg.maxWeeklyHours}h net per week per employee (minors 15-17: ${rules.jarbschg.maxDailyHours}h/${rules.jarbschg.maxWeeklyHours}h, no Sundays, done by ${rules.jarbschg.nightEndGastro16Plus}), and at least ${rules.arbzg.minRestHours}h rest between shifts on consecutive days. Violations will be voided by the system.
7. PINNED slots (templateId:dayN → employeeId) MUST be assigned exactly as given: ${JSON.stringify(pins.map((p) => `${p.shiftTemplateId}:day${p.dayOfWeek}→${p.employeeId}`))}
8. BLOCKED (employee never works these): ${JSON.stringify(blocks.map((b) => `${b.employeeId}@${b.shiftTemplateId ?? "any"}:day${b.dayOfWeek}`))}

Shift templates:
${JSON.stringify(templates, null, 2)}

Employees (with availability slots as "templateId:dayN"):
${JSON.stringify(availMatrix, null, 2)}

Return one assignment per person per (shiftTemplateId, dayOfWeek): a shift with minHeadcount N needs N assignments that day, each a different employee. Set employeeId to null for any seat with no eligible employee.
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
      vacations: options.vacations,
      weekStart: options.weekStart,
    })
    const voided: string[] = [...conflicts]
    const managerRules = options.managerRules ?? []
    const repairCounts: Record<string, number> = {}

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
        } else if (onVacationForSlot(options, emp.id, a.dayOfWeek, tmpl)) {
          voided.push(`${emp.name}: on vacation (day ${a.dayOfWeek})`)
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
          } else if (neverTogetherViolated(managerRules, emp.id, slot, acceptedShifts)) {
            voided.push(`${emp.name}: manager rule (never together, day ${a.dayOfWeek})`)
            employeeId = null
          } else if (maxShiftsReached(managerRules, emp.id, repairCounts)) {
            voided.push(`${emp.name}: manager rule (max shifts/week)`)
            employeeId = null
          } else {
            ;(acceptedShifts[emp.id] ??= []).push(slot)
            repairCounts[emp.id] = (repairCounts[emp.id] ?? 0) + 1
          }
        }
      } else if (!tmpl) {
        employeeId = null
      }

      return { shiftTemplateId: a.shiftTemplateId, dayOfWeek: a.dayOfWeek, employeeId, filled: employeeId !== null }
    })

    // Headcount: the LLM tends to emit ~one per slot. Rebuild to exactly
    // minHeadcount seats per (template, day), topping up any missing seats with
    // distinct, compliance-checked employees (or leaving them open).
    const filledBySlot = new Map<string, string[]>()
    for (const a of assignments) {
      if (!a.employeeId) continue
      const k = slotKey(a.shiftTemplateId, a.dayOfWeek)
      const arr = filledBySlot.get(k) ?? []
      if (!arr.includes(a.employeeId)) arr.push(a.employeeId)
      filledBySlot.set(k, arr)
    }
    const finalAssignments: GeneratedAssignment[] = []
    for (const tmpl of templates) {
      for (let day = 0; day < 7; day++) {
        const need = Math.max(1, tmpl.minHeadcount)
        const taken = new Set(filledBySlot.get(slotKey(tmpl.id, day)) ?? [])
        for (const empId of taken) {
          finalAssignments.push({ shiftTemplateId: tmpl.id, dayOfWeek: day, employeeId: empId, filled: true })
        }
        while (taken.size < need) {
          const slot = slotShift(day, tmpl)
          const candidate = employees
            .filter((emp) => {
              if (taken.has(emp.id)) return false
              if (isBlocked(blocks, emp.id, tmpl.id, day)) return false
              if (onVacationForSlot(options, emp.id, day, tmpl)) return false
              if (!isAssignable(emp.category, availSet.has(`${emp.id}:${tmpl.id}:${day}`))) return false
              if (tmpl.requiredRoles.length > 0 && !tmpl.requiredRoles.some((r) => emp.roles.includes(r))) return false
              if (neverTogetherViolated(managerRules, emp.id, slot, acceptedShifts)) return false
              if (maxShiftsReached(managerRules, emp.id, repairCounts)) return false
              return !checkEmployeeAssignment(emp, slot, acceptedShifts[emp.id] ?? [], rules, {
                monthNetHoursBeforeWeek: monthHours[emp.id] ?? 0,
              })
            })
            .sort((a, b) => (acceptedShifts[a.id]?.length ?? 0) - (acceptedShifts[b.id]?.length ?? 0))[0]
          if (!candidate) break
          ;(acceptedShifts[candidate.id] ??= []).push(slot)
          repairCounts[candidate.id] = (repairCounts[candidate.id] ?? 0) + 1
          taken.add(candidate.id)
          finalAssignments.push({ shiftTemplateId: tmpl.id, dayOfWeek: day, employeeId: candidate.id, filled: true })
        }
        if (taken.size < need) {
          if (need > 1) voided.push(`${tmpl.name} day ${day}: only ${taken.size}/${need} seats filled`)
          for (let i = taken.size; i < need; i++) {
            finalAssignments.push({ shiftTemplateId: tmpl.id, dayOfWeek: day, employeeId: null, filled: false })
          }
        }
      }
    }

    const reasoning =
      voided.length > 0
        ? `${result.reasoning}\n[compliance] ${voided.length} note(s): ${voided.join("; ")}`
        : result.reasoning

    return { assignments: finalAssignments, reasoning }
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

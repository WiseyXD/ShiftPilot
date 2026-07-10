// Pure inverse builder: given an executed tool call plus the prior state the
// executor captured, produce the fully-resolved tool call that reverses it —
// or null when the action is inherently irreversible (publishing a schedule,
// deleting a person, reporting sickness). The inverse re-runs through the
// dispatcher, so legality is re-checked at undo time, never assumed. Previews
// are written in the owner's language at execute time.

import { DEFAULT_LANG, t, type Lang } from "./i18n"
import type { InverseCall } from "./types"

export interface ExecutedAction {
  tool: string
  params: Record<string, unknown>
  // state the executor captured immediately before mutating
  prior?: Record<string, unknown>
}

export function buildInverse(action: ExecutedAction, lang: Lang = DEFAULT_LANG): InverseCall | null {
  const { tool, params, prior } = action
  const tr = t(lang)
  switch (tool) {
    case "reassign_shift": {
      const prevId = (prior?.employeeId as string | null) ?? null
      if (!prevId) {
        return {
          tool: "unassign_shift",
          params: { shiftId: params.shiftId },
          preview: tr.releaseShift,
        }
      }
      return {
        tool: "reassign_shift",
        // prior assignment was reality before — soft conflicts don't stall an undo
        params: { shiftId: params.shiftId, employeeId: prevId, override: true },
        preview: tr.shiftBackTo((prior?.employeeName as string) ?? tr.previousPerson),
      }
    }

    case "unassign_shift": {
      const prevId = (prior?.employeeId as string | null) ?? null
      if (!prevId) return null
      return {
        tool: "reassign_shift",
        params: { shiftId: params.shiftId, employeeId: prevId, override: true },
        preview: tr.shiftBackTo((prior?.employeeName as string) ?? tr.previousPerson),
      }
    }

    case "create_vacation":
      return prior?.vacationId
        ? {
            tool: "delete_vacation",
            params: { vacationId: prior.vacationId },
            preview: tr.removeVacationAgain,
          }
        : null

    case "delete_vacation":
      return prior?.employeeId
        ? {
            tool: "create_vacation",
            params: {
              employeeId: prior.employeeId,
              startDate: prior.startDate,
              endDate: prior.endDate,
            },
            preview: tr.restoreVacation,
          }
        : null

    case "create_rule":
      return prior?.ruleId
        ? { tool: "delete_rule", params: { ruleId: prior.ruleId }, preview: tr.deleteRuleAgain }
        : null

    case "delete_rule":
      return prior?.kind
        ? {
            tool: "restore_rule",
            params: {
              kind: prior.kind,
              params: prior.params,
              sourceText: prior.sourceText,
              plain: prior.plain,
            },
            preview: tr.restoreRule,
          }
        : null

    case "create_employee":
      return prior?.employeeId
        ? {
            tool: "delete_employee",
            params: { employeeId: prior.employeeId },
            preview: tr.removePersonAgain((prior?.name as string) ?? tr.somebody),
          }
        : null

    case "update_employee":
      return prior?.fields
        ? {
            tool: "update_employee",
            params: { employeeId: params.employeeId, fields: prior.fields },
            preview: tr.resetEmployee,
          }
        : null

    // Irreversible by design: outward notifications already went out, or the
    // cascade (deleted availability, tokens, shifts) can't be reconstructed.
    case "publish_schedule":
    case "generate_schedule":
    case "report_sick":
    case "delete_employee":
    case "restore_rule":
    default:
      return null
  }
}

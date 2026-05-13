"use client"

import { useState } from "react"

interface Candidate {
  employeeId?: string
  priority?: number
  outcome?: string
  [key: string]: unknown
}

interface AuditLogEntryProps {
  action: string
  actionLabel: string
  aiReasoning: string
  candidatesConsidered: unknown
  outcome: string
  createdAt: Date
}

const ACTION_COLORS: Record<string, string> = {
  SCHEDULE_GENERATED: "bg-blue-100 text-blue-800",
  SHIFT_ACCEPTED: "bg-green-100 text-green-800",
  SHIFT_DECLINED: "bg-red-100 text-red-800",
  REPLACEMENT_OUTREACH: "bg-orange-100 text-orange-800",
  ESCALATED_TO_MANAGER: "bg-red-100 text-red-800",
  SWAP_OUTREACH: "bg-purple-100 text-purple-800",
  SWAP_AUTO_APPROVED: "bg-green-100 text-green-800",
  SWAP_MANAGER_APPROVED: "bg-green-100 text-green-800",
  SWAP_MANAGER_REJECTED: "bg-red-100 text-red-800",
  SWAP_FAILED: "bg-red-100 text-red-800",
}

export function AuditLogEntry({
  action,
  actionLabel,
  aiReasoning,
  candidatesConsidered,
  outcome,
  createdAt,
}: AuditLogEntryProps) {
  const [expanded, setExpanded] = useState(false)

  const candidates = Array.isArray(candidatesConsidered)
    ? (candidatesConsidered as Candidate[])
    : []
  const hasCandidates = candidates.length > 0
  const hasDetail = aiReasoning || hasCandidates
  const badgeClass = ACTION_COLORS[action] ?? "bg-slate-100 text-slate-700"

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
      <div
        className="flex items-start justify-between p-4 cursor-pointer hover:bg-slate-50"
        onClick={() => hasDetail && setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-3 min-w-0">
          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${badgeClass}`}>
            {actionLabel}
          </span>
          <div className="min-w-0">
            <p className="text-sm text-slate-700 truncate">{outcome}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-xs text-slate-400">
            {new Date(createdAt).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {hasDetail && (
            <span className="text-xs text-slate-400">{expanded ? "▲" : "▼"}</span>
          )}
        </div>
      </div>

      {expanded && hasDetail && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 bg-slate-50 space-y-3">
          {aiReasoning && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                AI Reasoning
              </p>
              <p className="text-sm text-slate-700">{aiReasoning}</p>
            </div>
          )}
          {hasCandidates && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Candidates Considered
              </p>
              <div className="space-y-1">
                {candidates.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 text-xs text-slate-600 bg-white border border-slate-200 rounded-md px-3 py-2"
                  >
                    <span className="font-mono text-slate-400">{c.employeeId ?? "—"}</span>
                    {c.priority != null && (
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                        P{c.priority}
                      </span>
                    )}
                    {c.outcome && <span className="text-slate-500">{c.outcome}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

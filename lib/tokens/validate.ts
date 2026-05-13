import type { ActionTokenAction } from "@/prisma/generated/client/client"

export interface StoredToken {
  id: string
  action: ActionTokenAction
  payload: unknown
  expiresAt: Date
  usedAt: Date | null
}

type ValidateResult =
  | { ok: true; payload: unknown; action: ActionTokenAction }
  | { ok: false; reason: "expired" | "consumed" | "not_found" }

export function validateToken(token: StoredToken | null): ValidateResult {
  if (!token) return { ok: false, reason: "not_found" }
  if (token.usedAt) return { ok: false, reason: "consumed" }
  if (token.expiresAt < new Date()) return { ok: false, reason: "expired" }
  return { ok: true, payload: token.payload, action: token.action }
}

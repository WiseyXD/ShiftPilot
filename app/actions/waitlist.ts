"use server"

import { prisma } from "@/prisma/client"
import { z } from "zod"

// Public form — no auth, so validate hard and say little. The unique
// constraint on email is the dedupe; P2002 just means "already in".
export type WaitlistState = { status: "idle" | "joined" | "exists" | "invalid" }

export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData
): Promise<WaitlistState> {
  const raw = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const parsed = z.email().max(254).safeParse(raw)
  if (!parsed.success) return { status: "invalid" }

  const sourceRaw = String(formData.get("source") ?? "")
  const source = ["landing-hero", "landing-footer"].includes(sourceRaw) ? sourceRaw : null

  try {
    await prisma.waitlistEntry.create({ data: { email: parsed.data, source } })
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "P2002") return { status: "exists" }
    throw err
  }
  return { status: "joined" }
}

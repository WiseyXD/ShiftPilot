"use server"

import { hash } from "bcryptjs"
import { prisma } from "@/prisma/client"
import { signIn, signOut } from "@/auth"
import { AuthError } from "next-auth"

type ActionState = { error: string } | null

export async function signUp(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) return { error: "Email and password are required" }
  if (password.length < 8) return { error: "Password must be at least 8 characters" }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { error: "An account with this email already exists" }

  const passwordHash = await hash(password, 12)
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

  await prisma.user.create({ data: { email, passwordHash, trialEndsAt } })
  await signIn("credentials", { email, password, redirectTo: "/onboarding" })
  return null
}

export async function logIn(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    })
    return null
  } catch (error) {
    if (error instanceof AuthError) return { error: "Invalid email or password" }
    throw error
  }
}

export async function logOut() {
  await signOut({ redirectTo: "/login" })
}

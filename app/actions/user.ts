"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

export async function setLanguage(language: string) {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }
  if (language !== "en" && language !== "de") return { error: "Unsupported language" }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { language },
  })
  // DB is the source of truth server-side; the cookie mirrors it so client
  // components (e.g. the employees page) can read the language without a fetch.
  const jar = await cookies()
  jar.set("uiLang", language, { path: "/", maxAge: 60 * 60 * 24 * 365 })
  revalidatePath("/dashboard", "layout")
  return null
}

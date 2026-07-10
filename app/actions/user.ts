"use server"

import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { revalidatePath } from "next/cache"

export async function setLanguage(language: string) {
  const session = await auth()
  if (!session) return { error: "Not authenticated" }
  if (language !== "en" && language !== "de") return { error: "Unsupported language" }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { language },
  })
  revalidatePath("/dashboard", "layout")
  return null
}

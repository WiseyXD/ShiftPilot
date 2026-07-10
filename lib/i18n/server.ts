import { cache } from "react"
import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import type { UiLang } from "./dashboard"

// The signed-in user's UI language (sidebar toggle). cache() dedupes the
// lookup across layout + page within one request.
export const getUserLang = cache(async (): Promise<UiLang> => {
  const session = await auth()
  if (!session) return "en"
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { language: true },
  })
  return user?.language === "de" ? "de" : "en"
})

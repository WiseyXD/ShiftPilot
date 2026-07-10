"use client"

import type { UiLang } from "./dashboard"

// Client-side language lookup: the uiLang cookie is set by setLanguage and
// mirrors User.language. Missing cookie = the default (English).
export function useUiLang(): UiLang {
  if (typeof document === "undefined") return "en"
  const match = document.cookie.match(/(?:^|;\s*)uiLang=(en|de)/)
  return (match?.[1] as UiLang) ?? "en"
}

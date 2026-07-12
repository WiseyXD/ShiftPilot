"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { manualGenerateSchedule, generateDraftNow } from "@/app/actions/schedule"
import { Circle, ChevronRight, Loader2 } from "lucide-react"

// Onboarding checklist row that starts drafting instead of just linking away.
// Clicking kicks off the ask-first flow (Covrly asks the team in WhatsApp, then
// builds the draft once they reply). Disabled until shifts and team exist.
// `inProgress` is server-derived (asks sent, no draft yet), so the waiting state
// survives navigation — unlike the local click state. A "Build it now" escape
// hatch drafts immediately with whoever has replied, so a demo never gets stuck.
export function DraftNowStep({
  locationId,
  label,
  ready,
  inProgress = false,
}: {
  locationId: string
  label: string
  ready: boolean
  inProgress?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [clicked, setClicked] = React.useState(false)
  const [forcing, setForcing] = React.useState(false)

  const waiting = inProgress || clicked

  // While waiting for replies, keep refreshing so the draft appears (and this
  // card disappears) without a manual reload once the team finishes replying.
  React.useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => router.refresh(), 3000)
    return () => clearInterval(t)
  }, [waiting, router])

  const run = async () => {
    if (busy || waiting || !ready) return
    setBusy(true)
    await manualGenerateSchedule(locationId)
    setClicked(true)
    setBusy(false)
  }

  const buildNow = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (forcing) return
    setForcing(true)
    await generateDraftNow(locationId)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={run}
        disabled={busy || waiting || !ready}
        title={ready ? undefined : "Add your shifts and team first"}
        className="group flex w-full items-center gap-2 text-left text-sm text-foreground hover:text-primary disabled:cursor-default disabled:opacity-100 disabled:hover:text-foreground"
      >
        {busy || waiting ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <Circle className={`h-4 w-4 ${ready ? "text-muted-foreground/50" : "text-muted-foreground/30"}`} />
        )}
        <span className={waiting ? "text-primary" : ""}>
          {waiting ? "Asking your team — reply in WhatsApp and the draft appears here" : label}
        </span>
        {!waiting && (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
        )}
      </button>
      {waiting && (
        <button
          onClick={buildNow}
          disabled={forcing}
          className="ml-6 flex items-center gap-1 text-left text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline disabled:opacity-60"
        >
          {forcing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {forcing ? "Building…" : "Taking too long? Build the draft now →"}
        </button>
      )}
    </div>
  )
}

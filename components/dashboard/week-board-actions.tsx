"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { manualGenerateSchedule } from "@/app/actions/schedule"
import { approveSchedule } from "@/app/actions/schedule"
import { Sparkles, Megaphone, Loader2 } from "lucide-react"

// Generation runs as a durable background job — after kicking it off we poll
// router.refresh until the draft shows up (or we give up quietly).
export function GenerateDraftButton({
  locationId,
  label,
  pendingLabel,
}: {
  locationId: string
  label: string
  pendingLabel: string
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)

  const run = async () => {
    setBusy(true)
    await manualGenerateSchedule(locationId)
    let polls = 0
    const t = setInterval(() => {
      router.refresh()
      if (++polls >= 10) {
        clearInterval(t)
        setBusy(false)
      }
    }, 2500)
  }

  return (
    <Button size="sm" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {busy ? pendingLabel : label}
    </Button>
  )
}

export function PublishButton({ scheduleId, label }: { scheduleId: string; label: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)

  const run = async () => {
    setBusy(true)
    await approveSchedule(scheduleId, "")
    router.refresh()
    setBusy(false)
  }

  return (
    <Button size="sm" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
      {label}
    </Button>
  )
}

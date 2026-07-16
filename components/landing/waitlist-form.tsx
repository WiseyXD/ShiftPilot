"use client"

import * as React from "react"
import { useActionState } from "react"
import { joinWaitlist, type WaitlistState } from "@/app/actions/waitlist"
import { Button } from "@/components/ui/button"
import { CheckCircle2, ArrowRight } from "lucide-react"

const IDLE: WaitlistState = { status: "idle" }

export function WaitlistForm({ source }: { source: "landing-hero" | "landing-footer" }) {
  const [state, action, pending] = useActionState(joinWaitlist, IDLE)

  if (state.status === "joined" || state.status === "exists") {
    return (
      <div className="flex items-center gap-2.5 rounded-full border border-primary/25 bg-accent px-5 py-3 text-sm font-medium text-accent-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
        {state.status === "joined"
          ? "You're on the list — we'll email you when your spot opens."
          : "You're already on the list. We'll be in touch soon."}
      </div>
    )
  }

  return (
    <form action={action} className="w-full max-w-md">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          name="email"
          required
          placeholder="you@yourcafe.de"
          aria-label="Email address"
          className="h-12 flex-1 rounded-full border border-border bg-card px-5 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
        <input type="hidden" name="source" value={source} />
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="h-12 shrink-0 rounded-full px-6 text-sm font-semibold"
        >
          {pending ? "Joining…" : "Join the waitlist"}
          {!pending && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>
      {state.status === "invalid" && (
        <p className="mt-2 px-2 text-xs text-destructive">
          That doesn't look like an email address — mind checking it?
        </p>
      )}
    </form>
  )
}

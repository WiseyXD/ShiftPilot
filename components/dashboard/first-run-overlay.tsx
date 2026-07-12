import Link from "next/link"
import { Covrly } from "@/components/covrly"
import { ArrowRight, Sparkles } from "lucide-react"

// Shown over the (empty) dashboard on first run — setup is done but no schedule
// exists yet. Blurs the dashboard behind and invites the manager into the
// guided flow that creates their first week. Once a schedule exists it's gone.
export function FirstRunOverlay({ locationId, locationName }: { locationId: string; locationName: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-start justify-center rounded-2xl">
      {/* Sections are individually frosted + stamped "Locked" (see globals.css);
          this is just the invitation card floating above them. */}
      <div
        className="pointer-events-auto relative mt-14 w-full max-w-md rounded-3xl border border-primary/20 bg-card p-8 text-center shadow-2xl"
        style={{ animation: "firstRunIn .5s cubic-bezier(.2,.9,.3,1.15)" }}
      >
        <Covrly size={72} wave className="mx-auto drop-shadow" />
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          <Sparkles className="h-3.5 w-3.5" /> {locationName} is set up
        </p>
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-foreground">
          Let&rsquo;s create your first week ☕
        </h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          Covrly asks your team on WhatsApp, builds the plan, and handles the messy bits — call-outs,
          swaps, cover. Watch it once, then your dashboard is live.
        </p>
        <Link
          href={`/dashboard/${locationId}/live`}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.03] active:scale-95"
        >
          Start <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-3 text-xs text-muted-foreground/70">Takes about a minute · you&rsquo;re in control the whole way</p>
      </div>
      <style>{`@keyframes firstRunIn { from { opacity: 0; transform: translateY(14px) scale(.97) } to { opacity: 1; transform: translateY(0) scale(1) } }`}</style>
    </div>
  )
}

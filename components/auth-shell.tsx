import * as React from "react"
import { Covrly } from "@/components/covrly"

// Auth shell: warm-white brand panel on the left (the mascot sits directly
// on it — no backing chip), cream form paper on the right. Server-safe —
// pages drop their forms into <AuthPanel/>.

const PROOF_LINES = [
  ["Plans itself", "availability in, legal weekly plan out — you just approve"],
  ["Covers itself", "sick calls and declines trigger the replacement engine"],
  ["Defends itself", "ArbZG, JArbSchG & Minijob limits enforced by code"],
] as const

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      {/* Warm-white brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-sidebar text-sidebar-foreground p-12">
        {/* mint pooling in the corner + rings echoing the mascot's C */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(52rem 40rem at 8% 110%, rgba(143, 214, 201, 0.22), transparent 60%), radial-gradient(38rem 30rem at 105% -5%, rgba(37, 211, 102, 0.10), transparent 55%)",
          }}
        />
        <div
          aria-hidden
          className="absolute -right-40 top-1/3 h-[26rem] w-[26rem] rounded-full border-[10px] border-sidebar-foreground/[0.06]"
        />
        <div
          aria-hidden
          className="absolute -right-28 top-[40%] h-[18rem] w-[18rem] rounded-full border-2 border-sidebar-foreground/[0.08]"
        />

        <div className="relative rise rise-1 flex items-center gap-2.5">
          <Covrly size={40} wave />
          <span className="font-display text-xl font-semibold tracking-tight">Covrly</span>
        </div>

        <div className="relative max-w-md">
          <Covrly size={112} className="rise rise-1 mb-6 drop-shadow-xl" />
          <h1 className="rise rise-2 font-display text-[3.4rem] leading-[1.05] font-medium tracking-tight">
            Every shift
            <br />
            <em className="text-sidebar-primary not-italic font-semibold" style={{ fontStyle: "italic" }}>covered.</em>
          </h1>
          <p className="rise rise-3 mt-5 text-sidebar-foreground/70 text-lg leading-relaxed">
            Scheduling, sick-call cover and German working-time law — handled,
            while you make coffee.
          </p>
          <ul className="rise rise-4 mt-10 space-y-4">
            {PROOF_LINES.map(([lead, rest]) => (
              <li key={lead} className="flex items-baseline gap-3">
                <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-sidebar-primary" />
                <span className="text-sm leading-relaxed text-sidebar-foreground/80">
                  <strong className="font-semibold text-sidebar-foreground">{lead}.</strong>{" "}
                  {rest}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative rise rise-5 text-xs text-sidebar-foreground/50">
          Built for cafés &amp; restaurants · your staff never installs anything
        </p>
      </div>

      {/* Cream form paper */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}

export function AuthPanel({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="space-y-8">
      <div className="lg:hidden rise flex items-center gap-2.5">
        <Covrly size={38} wave />
        <span className="font-display text-xl font-semibold tracking-tight">Covrly</span>
      </div>
      <div>
        <h2 className="rise rise-1 font-display text-3xl font-medium tracking-tight">{title}</h2>
        <p className="rise rise-2 mt-2 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
      {footer && <p className="rise rise-5 text-xs text-muted-foreground/80">{footer}</p>}
    </div>
  )
}

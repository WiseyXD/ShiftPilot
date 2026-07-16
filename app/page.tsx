import type * as React from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Covrly } from "@/components/covrly"
import { Button } from "@/components/ui/button"
import { WaitlistForm } from "@/components/landing/waitlist-form"
import { Reveal } from "@/components/landing/reveal"
import { CalendarCheck, LifeBuoy, Scale, CheckCheck } from "lucide-react"

// Public landing page with waitlist capture. Light mode only — the page is
// the deck: cream paper, brand greens, one dark-green statement band. The
// hero's signature is the 3 a.m. sick call resolving itself in WhatsApp.

const PILLARS = [
  {
    icon: CalendarCheck,
    title: "Plans itself",
    body: "Availability comes in over WhatsApp and a legal draft of the week is waiting on your board. You approve — everyone gets their shifts in chat.",
  },
  {
    icon: LifeBuoy,
    title: "Covers itself",
    body: "A sick call starts the replacement engine: Covrly works out who may legally take the shift and asks them one by one. No group-chat chaos.",
  },
  {
    icon: Scale,
    title: "Defends itself",
    body: "ArbZG rest times, JArbSchG rules for minors, Minijob earnings caps — enforced in code on every single assignment, not checked after the fact.",
  },
] as const

const STEPS = [
  {
    title: "Your team is asked",
    body: "Covrly messages everyone on WhatsApp and collects who can work next week. No forms, no app to install.",
  },
  {
    title: "A legal week appears",
    body: "On draft day a complete, compliant rota lands on your board. Tweak what you like, approve once — shifts go out in chat.",
  },
  {
    title: "Life happens, Covrly handles it",
    body: "Sick calls, swaps and no-shows trigger cover the moment they're reported. You get told, not asked.",
  },
] as const

const LAWS = [
  { name: "ArbZG", desc: "working hours & rest windows" },
  { name: "JArbSchG", desc: "protection for under-18s" },
  { name: "Minijob", desc: "monthly earnings caps" },
] as const

// The hero vignette — each bubble pops in on its own delay (seconds).
function ChatVignette() {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-3xl bg-[#efeae2] shadow-xl ring-1 ring-foreground/10">
        {/* WhatsApp header */}
        <div className="flex items-center gap-2.5 bg-[#008069] px-4 py-3 text-white">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white">
            <Covrly size={26} />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Covrly</p>
            <p className="text-[11px] text-white/70">online</p>
          </div>
        </div>

        {/* Thread */}
        <div className="space-y-2.5 px-4 py-5 text-[13px] leading-snug">
          <div
            className="chat-pop max-w-[85%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-[#111b21] shadow-sm"
            style={{ "--pop": "0.3s" } as React.CSSProperties}
          >
            Chef, ich bin krank 🤒 I can&rsquo;t do tomorrow&rsquo;s evening shift.
            <span className="mt-0.5 block text-right text-[10px] text-[#667781]">03:12</span>
          </div>

          <div
            className="chat-pop mx-auto max-w-[90%] rounded-lg bg-[#fffcf7] px-3 py-2 text-center text-xs text-[#54656f] shadow-sm"
            style={{ "--pop": "1.2s" } as React.CSSProperties}
          >
            Covrly is finding cover for Tue 17:00–22:00 — checking hours, rest times and age rules
          </div>

          <p
            className="chat-pop text-center text-[11px] text-[#54656f]/80"
            style={{ "--pop": "2s" } as React.CSSProperties}
          >
            ✗ Tim skipped — would break the 20 h student cap
          </p>
          <p
            className="chat-pop text-center text-[11px] text-[#54656f]/80"
            style={{ "--pop": "2.6s" } as React.CSSProperties}
          >
            ✗ Lina skipped — under-18 night rule (JArbSchG)
          </p>

          <div
            className="chat-pop ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[#111b21] shadow-sm"
            style={{ "--pop": "3.4s" } as React.CSSProperties}
          >
            Hi Vedika! Tuesday 17:00–22:00 is open — can you take it?
            <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[#667781]">
              03:13 <CheckCheck className="h-3 w-3 text-[#53bdeb]" />
            </span>
          </div>

          <div
            className="chat-pop max-w-[70%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-[#111b21] shadow-sm"
            style={{ "--pop": "4.4s" } as React.CSSProperties}
          >
            Yes, I&rsquo;ll take it 👍
            <span className="mt-0.5 block text-right text-[10px] text-[#667781]">06:58</span>
          </div>

          <div
            className="chat-pop mx-auto w-fit rounded-full bg-[#0f7267] px-4 py-2 text-xs font-semibold text-[#fffcf7] shadow-sm"
            style={{ "--pop": "5.4s" } as React.CSSProperties}
          >
            ✓ Covered — you slept through the whole thing
          </div>
        </div>
      </div>

      {/* Mascot peeking over the corner */}
      <div className="float-y absolute -bottom-8 -left-7 hidden sm:block">
        <Covrly size={76} className="drop-shadow-lg" />
      </div>
    </div>
  )
}

export default async function HomePage() {
  const session = await auth()
  if (session) redirect("/dashboard")

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <Covrly size={34} />
          <span className="font-display text-xl font-semibold tracking-tight">Covrly</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Log in
            </Button>
          </Link>
          <Link href="#join" className="hidden sm:block">
            <Button size="sm" className="rounded-full px-4">
              Join the waitlist
            </Button>
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 pb-24 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:pt-16">
        <div>
          <p className="rise rise-1 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[#8fd6c9]" />
            Built for cafés &amp; restaurants in Germany
          </p>
          <h1 className="rise rise-2 mt-6 font-display text-5xl font-medium leading-[1.04] tracking-tight sm:text-6xl">
            Every shift{" "}
            <em className="font-semibold text-primary" style={{ fontStyle: "italic" }}>
              covered.
            </em>
            <br />
            Even the 3 a.m. one.
          </h1>
          <p className="rise rise-3 mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Covrly drafts your weekly rota, finds legal cover when someone calls in sick, and
            answers your team on WhatsApp — so you run the café, not the group chat.
          </p>
          <div className="rise rise-4 mt-8">
            <WaitlistForm source="landing-hero" />
          </div>
          <p className="rise rise-5 mt-4 text-sm text-muted-foreground/80">
            Early access rolls out café by café — the list holds your spot.
          </p>
        </div>

        <div className="rise rise-3">
          <ChatVignette />
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <Reveal className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            What Covrly does
          </p>
          <h2 className="mt-3 font-display text-3xl font-medium tracking-tight sm:text-4xl">
            You run the café. The rota runs itself.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.12}>
              <div className="h-full rounded-3xl border border-border bg-card p-6 shadow-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How a week goes */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              How it works
            </p>
            <h2 className="mt-3 font-display text-3xl font-medium tracking-tight sm:text-4xl">
              A week with Covrly
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map(({ title, body }, i) => (
              <Reveal key={title} delay={i * 0.12}>
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-display text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-semibold leading-snug">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Statement band — the deck's dark-green slide */}
      <section className="relative overflow-hidden bg-[#0e5f56] text-[#f4f1e8]">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(46rem 32rem at 10% 120%, rgba(143, 214, 201, 0.18), transparent 60%)",
          }}
        />
        <div
          aria-hidden
          className="absolute -right-32 -top-24 h-[22rem] w-[22rem] rounded-full border-[10px] border-[#f4f1e8]/[0.06]"
        />
        <div className="relative mx-auto w-full max-w-6xl px-6 py-20">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#8fd6c9]">
              Compliance
            </p>
            <h2 className="mt-3 font-display text-3xl font-medium tracking-tight sm:text-4xl">
              The law is built in.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#f4f1e8]/75">
              Every draft and every replacement passes the same checks — hour caps, rest windows,
              night rules for minors, earnings limits — before it ever reaches you.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-8 flex flex-wrap gap-3">
              {LAWS.map((law) => (
                <span
                  key={law.name}
                  className="rounded-full border border-[#8fd6c9]/30 bg-white/5 px-4 py-2 text-sm"
                >
                  <span className="font-semibold text-[#8fd6c9]">{law.name}</span>
                  <span className="text-[#f4f1e8]/70"> · {law.desc}</span>
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section id="join" className="mx-auto w-full max-w-6xl scroll-mt-10 px-6 py-24 text-center">
        <Reveal>
          <Covrly size={84} wave className="mx-auto" />
          <h2 className="mt-6 font-display text-3xl font-medium tracking-tight sm:text-4xl">
            Be first behind the counter
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
            Covrly is rolling out to a first group of cafés and restaurants. Leave your email and
            we&rsquo;ll hold you a spot.
          </p>
          <div className="mx-auto mt-8 flex max-w-md justify-center">
            <WaitlistForm source="landing-footer" />
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Covrly size={22} />
            <span>© 2026 Covrly · Built for cafés &amp; restaurants</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-foreground">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

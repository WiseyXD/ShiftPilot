"use client"

// The Covrly Copilot panel: slides open on every dashboard page, scoped to
// the location on screen. Same conversation as the owner thread in the
// WhatsApp simulator — two windows, one brain.

import * as React from "react"
import { usePathname } from "next/navigation"
import { sendOwnerMessage } from "@/app/actions/agent"
import { parseGridMarker } from "@/lib/agent/grid-marker"
import { AssistantGrid } from "./assistant-grid"
import { Send, X, Sparkles, RotateCcw } from "lucide-react"
import { Covrly } from "@/components/covrly"

interface ChatAction {
  label: string
  command: string
}

interface Message {
  id: string
  role: "OWNER" | "AGENT" | "EMPLOYEE"
  body: string
  actions: ChatAction[] | null
  createdAt: string
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })

// The agent writes WhatsApp-style *bold* and newlines.
function formatBody(body: string): React.ReactNode[] {
  return body.split("\n").flatMap((line, li) => {
    const parts = line.split(/(\*[^*]+\*)/g).map((seg, si) =>
      seg.startsWith("*") && seg.endsWith("*") ? (
        <strong key={si}>{seg.slice(1, -1)}</strong>
      ) : (
        <React.Fragment key={si}>{seg}</React.Fragment>
      )
    )
    return li === 0 ? parts : [<br key={`br${li}`} />, ...parts]
  })
}

const COPY = {
  en: {
    undoTitle: "Undo the last action",
    thinking: "thinking…",
    placeholder: "What should I do?",
    emptyLead: "Just tell me what you need — English or German. E.g. ",
    examples: ['"Who works Friday?"', '"Create next week\'s schedule"', '"Marco is sick"'],
  },
  de: {
    undoTitle: "Letzte Aktion rückgängig machen",
    thinking: "denkt nach…",
    placeholder: "Was soll ich tun?",
    emptyLead: "Sag mir einfach, was du brauchst — Deutsch oder Englisch. Z. B. ",
    examples: ["„Wer arbeitet Freitag?“", "„Erstell den Plan für nächste Woche“", "„Marco ist krank“"],
  },
}

export function AgentChatPanel({
  locations,
  lang = "en",
}: {
  locations: { id: string; name: string }[]
  lang?: "en" | "de"
}) {
  const copy = COPY[lang]
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [draft, setDraft] = React.useState("")
  const [pending, setPending] = React.useState<string | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // The location on screen wins; otherwise the owner's first location (v1).
  const routeLocation = pathname.match(/^\/dashboard\/([^/]+)/)?.[1]
  const location = locations.find((l) => l.id === routeLocation) ?? locations[0] ?? null

  const loadThread = React.useCallback(async () => {
    if (!location) return
    const res = await fetch(`/api/agent/${location.id}`, { cache: "no-store" })
    if (!res.ok) return
    const data = await res.json()
    setMessages(data.messages ?? [])
  }, [location])

  React.useEffect(() => {
    if (!open || !location) return
    loadThread()
    const t = setInterval(loadThread, 2500)
    return () => clearInterval(t)
  }, [open, location, loadThread])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, pending, open])

  if (!location) return null

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || pending) return
    setPending(trimmed)
    setDraft("")
    await sendOwnerMessage(location.id, trimmed, pathname)
    setPending(null)
    await loadThread()
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Covrly Copilot"
          className="fixed bottom-5 right-5 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-primary p-3 text-primary-foreground shadow-lg transition-transform hover:scale-105"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      )}

      {open && (
        <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
          {/* Header */}
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary/10">
              <Covrly size={32} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold leading-tight text-foreground">
                Covrly Copilot
              </p>
              <p className="truncate text-xs text-muted-foreground">{location.name}</p>
            </div>
            <button
              onClick={() => send("undo")}
              title={copy.undoTitle}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-background px-4 py-4">
            {messages.length === 0 && !pending && (
              <div className="mx-auto mt-8 max-w-xs rounded-lg border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
                {copy.emptyLead}
                <strong>{copy.examples[0]}</strong>, <strong>{copy.examples[1]}</strong>,{" "}
                <strong>{copy.examples[2]}</strong>.
              </div>
            )}
            {messages.map((m) =>
              m.role === "AGENT" ? (
                <div key={m.id} className="flex flex-col items-start">
                  {(() => {
                    const { text, gridWeek, highlight } = parseGridMarker(m.body)
                    return (
                      <>
                        <div className="max-w-[85%] rounded-xl rounded-tl-sm border border-border bg-card px-3 py-2 text-sm text-foreground">
                          {text && <p className="whitespace-pre-wrap leading-snug">{formatBody(text)}</p>}
                          <span className="mt-1 block text-right text-[10px] text-muted-foreground">
                            {time(m.createdAt)}
                          </span>
                        </div>
                        {gridWeek !== null && (
                          <div className="mt-1 w-full">
                            <AssistantGrid locationId={location.id} weekOffset={gridWeek} highlight={highlight} />
                          </div>
                        )}
                      </>
                    )
                  })()}
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-1 flex w-[85%] flex-col overflow-hidden rounded-xl border border-border bg-card">
                      {m.actions.map((a) => (
                        <button
                          key={a.command}
                          onClick={() => send(a.command)}
                          className="border-t border-border py-2 text-sm font-medium text-primary first:border-t-0 hover:bg-accent/50"
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-primary/90 px-3 py-2 text-sm text-primary-foreground">
                    <p className="whitespace-pre-wrap leading-snug">{formatBody(m.body)}</p>
                    <span className="mt-1 block text-right text-[10px] opacity-70">
                      {time(m.createdAt)}
                    </span>
                  </div>
                </div>
              )
            )}
            {pending && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-primary/60 px-3 py-2 text-sm text-primary-foreground">
                  <p className="whitespace-pre-wrap leading-snug">{formatBody(pending)}</p>
                  <span className="mt-1 block text-right text-[10px] opacity-70">…</span>
                </div>
              </div>
            )}
            {pending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Covrly size={18} /> {copy.thinking}
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(draft)
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={copy.placeholder}
              className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={!draft.trim() || !!pending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </aside>
      )}
    </>
  )
}

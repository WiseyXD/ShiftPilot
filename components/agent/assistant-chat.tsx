"use client"

import * as React from "react"
import { sendOwnerMessage, clearOwnerThread } from "@/app/actions/agent"
import { parseGridMarker } from "@/lib/agent/grid-marker"
import { AssistantGrid } from "./assistant-grid"
import { Covrly } from "@/components/covrly"
import { Send, RotateCcw, Trash2, Sparkles } from "lucide-react"

interface ChatAction { label: string; command: string }
interface Message {
  id: string
  role: "OWNER" | "AGENT" | "EMPLOYEE"
  body: string
  actions: ChatAction[] | null
  createdAt: string
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

function formatBody(body: string): React.ReactNode[] {
  return body.split("\n").flatMap((line, li) => {
    const parts = line.split(/(\*[^*]+\*)/g).map((seg, si) =>
      seg.startsWith("*") && seg.endsWith("*") ? <strong key={si}>{seg.slice(1, -1)}</strong> : <React.Fragment key={si}>{seg}</React.Fragment>
    )
    return li === 0 ? parts : [<br key={`br${li}`} />, ...parts]
  })
}

const SUGGESTIONS = [
  "Who works Friday?",
  "How are the hours looking next week?",
  "Move Marco's Friday shift to Lena",
  "Publish next week",
]

export function AssistantChat({
  locationId,
  locationName,
}: {
  locationId: string
  locationName: string
}) {
  const [messages, setMessages] = React.useState<Message[]>([])
  const [draft, setDraft] = React.useState("")
  const [pending, setPending] = React.useState<string | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const loadThread = React.useCallback(async () => {
    const res = await fetch(`/api/agent/${locationId}`, { cache: "no-store" })
    if (!res.ok) return
    const data = await res.json()
    setMessages(data.messages ?? [])
  }, [locationId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial thread load; same polling pattern as the copilot panel
    loadThread()
    const t = setInterval(loadThread, 2500)
    return () => clearInterval(t)
  }, [loadThread])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, pending])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || pending) return
    setPending(trimmed)
    setDraft("")
    await sendOwnerMessage(locationId, trimmed, "the Assistant tab")
    setPending(null)
    await loadThread()
  }

  const clear = async () => {
    await clearOwnerThread(locationId)
    await loadThread()
  }

  return (
    <div className="rise flex h-[calc(100svh-9rem)] min-h-[34rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-primary/[0.06] to-transparent px-5 py-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Covrly size={34} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold leading-tight text-foreground">Covrly Assistant</p>
          <p className="truncate text-xs text-muted-foreground">Runs {locationName} with you · ask for anything</p>
        </div>
        <button onClick={() => send("undo")} title="Undo the last action" className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
          <RotateCcw className="h-4 w-4" />
        </button>
        <button onClick={clear} title="Clear conversation" className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
          <Trash2 className="h-4 w-4" />
        </button>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-background px-4 py-5 sm:px-6">
        {messages.length === 0 && !pending && (
          <div className="mx-auto mt-6 max-w-md text-center">
            <Covrly size={56} wave className="mx-auto" />
            <p className="mt-3 font-display text-lg font-medium text-foreground">How can I help run {locationName}?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask me anything about your schedule — I&rsquo;ll look it up or make the change. When I edit a week, I&rsquo;ll show you the grid.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          if (m.role === "AGENT") {
            const { text, gridWeek, highlight } = parseGridMarker(m.body)
            return (
              <div key={m.id} className="flex flex-col items-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm">
                  {text && <p className="whitespace-pre-wrap leading-snug">{formatBody(text)}</p>}
                  <span className="mt-1 block text-right text-[10px] text-muted-foreground">{time(m.createdAt)}</span>
                </div>
                {gridWeek !== null && (
                  <div className="mt-1 w-full max-w-[92%]">
                    <AssistantGrid locationId={locationId} weekOffset={gridWeek} highlight={highlight} />
                  </div>
                )}
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-1.5 flex w-[85%] flex-col overflow-hidden rounded-xl border border-border bg-card">
                    {m.actions.map((a) => (
                      <button key={a.command} onClick={() => send(a.command)} className="border-t border-border py-2 text-sm font-medium text-primary first:border-t-0 hover:bg-accent/50">
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          }
          return (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground shadow-sm">
                <p className="whitespace-pre-wrap leading-snug">{formatBody(m.body)}</p>
                <span className="mt-1 block text-right text-[10px] opacity-70">{time(m.createdAt)}</span>
              </div>
            </div>
          )
        })}

        {pending && (
          <>
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary/60 px-3.5 py-2.5 text-sm text-primary-foreground">
                <p className="whitespace-pre-wrap leading-snug">{formatBody(pending)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Covrly size={18} /> thinking…
            </div>
          </>
        )}
      </div>

      {/* Composer */}
      <form onSubmit={(e) => { e.preventDefault(); send(draft) }} className="flex items-center gap-2 border-t border-border bg-card p-3 sm:px-5">
        <Sparkles className="hidden h-4 w-4 shrink-0 text-primary sm:block" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask Covrly to do anything…"
          className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button type="submit" disabled={!draft.trim() || !!pending} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}

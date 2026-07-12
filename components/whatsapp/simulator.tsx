"use client"

import * as React from "react"
import { sendChatMessage, clearChatThread, resetDemo } from "@/app/actions/whatsapp-sim"
import { sendOwnerMessage, clearOwnerThread } from "@/app/actions/agent"
import { Send, Check, CheckCheck, MoreVertical, Search, Phone, Sparkles, RotateCcw } from "lucide-react"
import { Covrly } from "@/components/covrly"

// Sentinel id for the owner ⇄ copilot thread pinned above the team chats.
const OWNER_THREAD = "__owner__"

interface Employee {
  id: string
  name: string
  roles: string[]
  category: "MINIJOB_ZEITARBEIT" | "TEILZEIT_FEST"
  phone: string | null
}

interface ChatAction {
  label: string
  command: string
}

interface Message {
  id: string
  role: "EMPLOYEE" | "AGENT" | "OWNER"
  body: string
  actions: ChatAction[] | null
  createdAt: string
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })

// WhatsApp renders *bold* and newlines — render just those.
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

const OWNER_COPY = {
  en: {
    railTitle: "You (owner)",
    railSub: "Covrly Copilot — your line into the system",
    headerSub: "runs your café with you · online",
    empty: (
      <>
        Tell your copilot what to do — English or German. E.g.{" "}
        <strong>&quot;Who works Friday?&quot;</strong> or <strong>&quot;Marco is sick&quot;</strong>.
      </>
    ),
    chips: [
      ["Who works this week?", "Who works this week?"],
      ["Hours check", "How are the hours looking this week?"],
      ["Create schedule", "Create the schedule for next week"],
      ["Undo", "undo"],
    ],
  },
  de: {
    railTitle: "Du (Inhaber:in)",
    railSub: "Covrly Copilot — dein Draht ins System",
    headerSub: "führt dein Café mit dir · online",
    empty: (
      <>
        Sag deinem Copilot, was zu tun ist — Deutsch oder Englisch. Z.&nbsp;B.{" "}
        <strong>&quot;Wer arbeitet Freitag?&quot;</strong> oder <strong>&quot;Marco ist krank&quot;</strong>.
      </>
    ),
    chips: [
      ["Wer arbeitet diese Woche?", "Wer arbeitet diese Woche?"],
      ["Stunden-Check", "Wie sehen die Stunden diese Woche aus?"],
      ["Plan erstellen", "Erstell den Plan für nächste Woche"],
      ["Rückgängig", "rückgängig"],
    ],
  },
}

export function WhatsAppSimulator({
  locationId,
  locationName,
  employees,
  ownerLang = "en",
}: {
  locationId: string
  locationName: string
  employees: Employee[]
  ownerLang?: "en" | "de"
}) {
  const ownerCopy = OWNER_COPY[ownerLang]
  const [selectedId, setSelectedId] = React.useState<string | null>(
    employees[0]?.id ?? OWNER_THREAD
  )
  const [messages, setMessages] = React.useState<Message[]>([])
  const [draft, setDraft] = React.useState("")
  const [pending, setPending] = React.useState<string | null>(null)
  const [resetting, setResetting] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const isOwnerThread = selectedId === OWNER_THREAD
  const selected = employees.find((e) => e.id === selectedId) ?? null

  const loadThread = React.useCallback(
    async (id: string) => {
      const res = await fetch(
        id === OWNER_THREAD ? `/api/agent/${locationId}` : `/api/whatsapp-sim/${id}`,
        { cache: "no-store" }
      )
      if (!res.ok) return
      const data = await res.json()
      setMessages(data.messages ?? [])
    },
    [locationId]
  )

  // Poll the selected thread so proactive agent messages appear live.
  React.useEffect(() => {
    if (!selectedId) return
    setMessages([])
    loadThread(selectedId)
    const t = setInterval(() => loadThread(selectedId), 2500)
    return () => clearInterval(t)
  }, [selectedId, loadThread])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, pending])

  const send = async (text: string) => {
    if (!selectedId || !text.trim()) return
    setPending(text.trim())
    setDraft("")
    if (isOwnerThread) await sendOwnerMessage(locationId, text.trim())
    else await sendChatMessage(selectedId, text.trim())
    setPending(null)
    await loadThread(selectedId)
  }

  const reset = async () => {
    if (!selectedId) return
    if (isOwnerThread) await clearOwnerThread(locationId)
    else await clearChatThread(selectedId)
    await loadThread(selectedId)
  }

  // Full demo reset: wipe schedules, chats, availability replies & sick calls so
  // the whole generate → publish → swap loop can be run again from scratch.
  const runResetDemo = async () => {
    if (
      !window.confirm(
        "Reset the demo?\n\nThis clears every schedule, chat thread, availability reply and sick call for this location. Employees, shift templates and their usual availability are kept."
      )
    )
      return
    setResetting(true)
    await resetDemo(locationId)
    await loadThread(selectedId ?? OWNER_THREAD)
    setResetting(false)
  }

  return (
    <div className="rise flex h-[calc(100svh-11rem)] min-h-[32rem] overflow-hidden rounded-2xl border border-border shadow-lg">
      {/* Chat list rail */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-card sm:flex">
        <div className="flex items-center gap-2 bg-[#008069] px-4 py-3 text-white">
          <Phone className="h-4 w-4" />
          <span className="font-display font-semibold tracking-tight">{locationName}</span>
        </div>
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-muted-foreground">
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5" />
            <span className="text-xs">Your team — tap to open a chat</span>
          </span>
          <button
            onClick={runResetDemo}
            disabled={resetting}
            title="Reset demo — clear all schedules, chats, availability replies & sick calls"
            className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium hover:text-red-600 disabled:opacity-50"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${resetting ? "animate-spin" : ""}`} />
            {resetting ? "Resetting…" : "Reset demo"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Owner ⇄ copilot thread, pinned above the team */}
          <button
            onClick={() => setSelectedId(OWNER_THREAD)}
            className={`flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-accent/40 ${
              isOwnerThread ? "bg-accent/60" : ""
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                {ownerCopy.railTitle}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {ownerCopy.railSub}
              </span>
            </span>
          </button>
          {employees.map((e) => (
            <button
              key={e.id}
              onClick={() => setSelectedId(e.id)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/40 ${
                e.id === selectedId ? "bg-accent/60" : ""
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#008069]/15 text-sm font-semibold text-[#075e54]">
                {initials(e.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{e.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {e.roles.join(", ") || (e.category === "TEILZEIT_FEST" ? "Festangestellt" : "Minijob")}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Chat pane */}
      {selected || isOwnerThread ? (
        <section className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <header className="flex items-center gap-3 bg-[#008069] px-4 py-2.5 text-white">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white">
              <Covrly size={34} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">
                {isOwnerThread ? "Covrly Copilot" : selected!.name}
              </p>
              <p className="text-[11px] text-white/70">
                {isOwnerThread ? ownerCopy.headerSub : "Covrly · online"}
              </p>
            </div>
            <button
              onClick={reset}
              title="Reset this conversation"
              className="rounded p-1.5 text-white/80 hover:bg-white/10"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </header>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4"
            style={{ backgroundColor: "#efeae2" }}
          >
            {messages.length === 0 && !pending && (
              <div className="mx-auto mt-6 max-w-xs rounded-lg bg-[#ffeecd] px-4 py-3 text-center text-xs text-[#54656f] shadow-sm">
                {isOwnerThread ? (
                  ownerCopy.empty
                ) : (
                  <>
                    Text <strong>&quot;Hi&quot;</strong> or tap a suggestion below to start
                    chatting with Covrly.
                  </>
                )}
              </div>
            )}
            {messages.map((m) =>
              m.role === "AGENT" ? (
                <div key={m.id} className="flex flex-col items-start">
                  <div className="max-w-[80%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm text-[#111b21] shadow-sm">
                    <p className="whitespace-pre-wrap leading-snug">{formatBody(m.body)}</p>
                    <span className="mt-1 block text-right text-[10px] text-[#667781]">{time(m.createdAt)}</span>
                  </div>
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-1 w-[80%] max-w-[80%] overflow-hidden rounded-lg bg-white shadow-sm">
                      {m.actions.map((a) => (
                        <button
                          key={a.command}
                          onClick={() => send(a.command)}
                          className="flex w-full items-center justify-center gap-1.5 border-t border-[#e9edef] py-2 text-sm font-medium text-[#008069] first:border-t-0 hover:bg-[#f5f6f6]"
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-sm text-[#111b21] shadow-sm">
                    <p className="whitespace-pre-wrap leading-snug">{formatBody(m.body)}</p>
                    <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#667781]">
                      {time(m.createdAt)}
                      <CheckCheck className="h-3 w-3 text-[#53bdeb]" />
                    </span>
                  </div>
                </div>
              )
            )}
            {pending && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-lg rounded-tr-none bg-[#d9fdd3]/70 px-3 py-2 text-sm text-[#111b21] shadow-sm">
                  <p className="whitespace-pre-wrap leading-snug">{formatBody(pending)}</p>
                  <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#667781]">
                    <Check className="h-3 w-3" />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick chips + composer */}
          <div className="border-t border-border bg-card">
            <div className="flex flex-wrap gap-1.5 px-3 pt-2">
              {(isOwnerThread
                ? ownerCopy.chips
                : [
                    ["My shifts", "my shifts"],
                    ["Open shifts", "open"],
                    ["Call in sick", "sick"],
                    ["Help", "hi"],
                  ]
              ).map(([label, cmd]) => (
                <button
                  key={label}
                  onClick={() => send(cmd)}
                  className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:border-[#008069] hover:text-[#008069]"
                >
                  {label}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send(draft)
              }}
              className="flex items-center gap-2 p-3"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-[#008069]"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      ) : (
        <section className="flex flex-1 items-center justify-center bg-card text-center text-muted-foreground">
          <p className="text-sm">Add an employee to start a conversation.</p>
        </section>
      )}
    </div>
  )
}

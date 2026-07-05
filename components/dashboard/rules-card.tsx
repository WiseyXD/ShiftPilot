"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  parseManagerRule,
  saveManagerRule,
  deleteManagerRule,
  type RuleParseState,
} from "@/app/actions/manager-rules"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Wand2 } from "lucide-react"

interface RuleRow {
  id: string
  kind: string
  plain: string
  sourceText: string
}

export function RulesCard({ locationId, rules }: { locationId: string; rules: RuleRow[] }) {
  const router = useRouter()
  const [text, setText] = useState("")
  const [state, setState] = useState<RuleParseState>(null)
  const [pending, setPending] = useState(false)

  const parse = async () => {
    setPending(true)
    const fd = new FormData()
    fd.set("locationId", locationId)
    fd.set("text", text)
    setState(await parseManagerRule(null, fd))
    setPending(false)
  }

  const confirm = async () => {
    if (!state || !("draft" in state)) return
    setPending(true)
    await saveManagerRule(locationId, state.draft)
    setPending(false)
    setState(null)
    setText("")
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="h-4 w-4" />
          Scheduling rules
        </CardTitle>
        <CardDescription>
          Type a rule in plain language — you confirm the interpretation, the scheduler enforces
          it deterministically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setState(null)
            }}
            placeholder='e.g. "Anna und Ben nie zusammen einplanen"'
          />
          <Button size="sm" onClick={parse} disabled={pending || !text.trim()}>
            {pending ? "…" : "Parse"}
          </Button>
        </div>

        {state && "error" in state && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{state.error}</p>
        )}
        {state && "draft" in state && (
          <div className="text-sm bg-slate-50 border border-slate-200 rounded-md px-3 py-2 space-y-2">
            <p>
              Understood as: <strong>{state.draft.plain}</strong>{" "}
              <Badge variant="secondary" className="text-[10px]">
                {state.draft.kind.replaceAll("_", " ").toLowerCase()}
              </Badge>
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={confirm} disabled={pending}>
                Correct — save it
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setState(null)}>
                No, discard
              </Button>
            </div>
          </div>
        )}

        <ul className="divide-y divide-slate-100">
          {rules.map((r) => (
            <li key={r.id} className="py-2 flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-700">
                {r.plain}
                <span className="block text-xs text-slate-400">“{r.sourceText}”</span>
              </span>
              <form
                action={async () => {
                  await deleteManagerRule(r.id)
                  router.refresh()
                }}
              >
                <Button type="submit" variant="ghost" size="sm" className="text-slate-400 hover:text-red-600">
                  Remove
                </Button>
              </form>
            </li>
          ))}
          {rules.length === 0 && <li className="py-2 text-sm text-slate-400">No rules yet.</li>}
        </ul>
      </CardContent>
    </Card>
  )
}

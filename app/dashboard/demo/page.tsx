"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sparkles } from "lucide-react"

export default function DemoPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [staleSession, setStaleSession] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!email.trim()) {
      setError("Enter your email address.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/dev/seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === "SESSION_STALE") { setStaleSession(true); return }
        setError(data.error ?? "Something went wrong.")
        return
      }
      router.push(
        data.scheduleId
          ? `/dashboard/${data.locationId}/schedules/${data.scheduleId}?demo=1`
          : `/dashboard/${data.locationId}`
      )
    } catch {
      setError("Network error — is the dev server running?")
    } finally {
      setLoading(false)
    }
  }

  const [resetMsg, setResetMsg] = useState("")
  const handleReset = async () => {
    setLoading(true)
    setResetMsg("")
    await fetch("/api/dev/seed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reset: true }),
    })
    setLoading(false)
    setResetMsg("Demo data cleared. Enter your email and click Set up demo to create a fresh one.")
  }

  if (staleSession) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-xl font-bold text-slate-900">Session expired</h2>
        <p className="text-sm text-slate-500">
          The database was reset but your browser still holds an old login cookie.
          Sign out and create a fresh account to continue.
        </p>
        <a
          href="/api/auth/signout"
          className="inline-block bg-slate-900 text-white text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-slate-700"
        >
          Sign out &amp; go to login
        </a>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-6">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 mb-3">
          <Sparkles className="h-6 w-6 text-slate-700" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Try the full demo</h1>
        <p className="text-slate-500 mt-2 text-sm leading-relaxed">
          Every shift email — for every demo employee — will land in your inbox.
          You play all four roles to test accept, decline, swap, and replacement flows.
        </p>
      </div>

      <Card>
        <CardContent className="py-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Your email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="aryan.s.nag@gmail.com"
                required
              />
              <p className="text-xs text-slate-400">All four demo employees route to this address.</p>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-xs space-y-3">
              <div>
                <p className="font-semibold text-slate-700 mb-1.5">What gets created</p>
                <ul className="space-y-1 text-slate-600">
                  <li>· Demo Café with Morning / Afternoon / Evening templates</li>
                  <li>· 4 employees (Alice, Bob, Carol, Dave)</li>
                  <li>· Sun–Sat schedule, pre-assigned round-robin</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-700 mb-1.5">What you can test</p>
                <ul className="space-y-1 text-slate-600">
                  <li>· Approve schedule → emails with accept / decline / swap links</li>
                  <li>· Decline → replacement engine contacts the next employee</li>
                  <li>· Request a swap → broker proposes it automatically</li>
                  <li>· Audit log shows every AI decision with reasoning</li>
                </ul>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {resetMsg && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                ✓ {resetMsg}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Setting up…" : "Set up demo & go to schedule"}
            </Button>

            <Button
              type="button"
              onClick={handleReset}
              disabled={loading}
              variant="ghost"
              size="sm"
              className="w-full text-slate-400 hover:text-slate-700"
            >
              Reset existing demo data
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

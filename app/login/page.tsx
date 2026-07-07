"use client"

import Link from "next/link"
import { useActionState } from "react"
import { logIn } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthPanel, AuthShell } from "@/components/auth-shell"

export default function LoginPage() {
  const [state, action, pending] = useActionState(logIn, null)

  return (
    <AuthShell>
      <AuthPanel
        title="Welcome back"
        subtitle={
          <>
            New here?{" "}
            <Link href="/signup" className="font-semibold text-primary hover:underline underline-offset-4">
              Create an account
            </Link>
          </>
        }
      >
        <form action={action} className="space-y-5">
          {state?.error && (
            <p className="rise text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-md">
              {state.error}
            </p>
          )}
          <div className="space-y-1.5 rise rise-3">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              htmlFor="email"
            >
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@yourcafe.de"
              className="h-11 bg-card"
            />
          </div>
          <div className="space-y-1.5 rise rise-4">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              htmlFor="password"
            >
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="h-11 bg-card"
            />
          </div>
          <Button type="submit" size="lg" className="w-full rise rise-5" disabled={pending}>
            {pending ? "Brewing…" : "Sign in"}
          </Button>
        </form>
      </AuthPanel>
    </AuthShell>
  )
}

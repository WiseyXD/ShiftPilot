import { NextRequest, NextResponse } from "next/server"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import * as React from "react"

// Dev-only route — remove before production deployment
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 })
  }

  const { to } = await req.json()
  if (!to) {
    return NextResponse.json({ error: "to is required" }, { status: 400 })
  }

  await sendEmail({
    to,
    subject: "Covrly — test email",
    react: React.createElement(NotificationEmail, {
      heading: "Email delivery confirmed",
      body: "This is a test email from Covrly. If you received this, transactional email is working correctly.",
      ctaLabel: "Visit Covrly",
      ctaUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    }),
  })

  return NextResponse.json({ ok: true })
}

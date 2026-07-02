import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { buildNudgeUrl } from "@/lib/marketplace/nudge"

// Thin redirect: resolves (or re-issues) the pending tokens server-side at tap
// time, then hands off to WhatsApp. Keeps token IDs out of the rendered page.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL))
  }

  const { dealId } = await params
  const result = await buildNudgeUrl(dealId, session.user.id)

  if (!result.ok) {
    return new Response(
      `<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2 style="color:#dc2626">${result.error}</h2><p style="color:#64748b">Head back to the marketplace to check the deal's status.</p></body></html>`,
      { headers: { "content-type": "text/html" }, status: 409 }
    )
  }

  return NextResponse.redirect(result.url)
}

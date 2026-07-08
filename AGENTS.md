<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ShiftPilot — project rules

## Where things live

- `proxy.ts` (NOT `middleware.ts`) is at the repo root — Next.js 16 file convention, runs in Node.js runtime
- Inngest functions: `lib/inngest/functions/` — register them in `app/api/inngest/route.ts`
- Pure logic (tested with Vitest): `lib/scheduling/`, `lib/tokens/validate.ts`
- Shared helpers: `lib/scheduling/shift-date.ts` for any code that needs to compute a real shift date or Google Calendar URL
- Email templates: `lib/email/templates/`, sent via `lib/email/send.ts` (which honours `DEV_EMAIL_OVERRIDE`)
- Dashboard pages share `components/dashboard/page-header.tsx` and the sidebar shell at `app/dashboard/layout.tsx`

## Hard rules

- **Always compute shift dates from `weekStart + dayOfWeek`** — never assume a shift is on weekStart. Use `getShiftStart/getShiftEnd/formatShiftDate` from `lib/scheduling/shift-date.ts`.
- **Long Inngest waits use `step.waitForEvent` with a `match` field**, never `step.sleep` followed by a DB poll. The replacement and swap workflows both depend on this.
- **Guard token actions with status checks** — `ACCEPT_SHIFT` and `DECLINE_SHIFT` must refuse if `status !== "PENDING"`. Don't let a declined employee re-accept.
- **Token GET handler must surface errors as red HTML pages**, not silent green "Done!" responses. Check `response.ok` before consuming the token.
- **Don't import Prisma/auth into client components.** If a page needs auth state, make it a server component and pass props down.

## Pre-existing patterns to follow

- Pages use `<PageHeader title description action />` for consistent titles
- Cards: `Card` + `CardHeader` + `CardContent` (or `CardTitle` + `CardDescription` inside header)
- Empty states: dashed `Card` with icon-in-circle + heading + description
- Status badges follow the shared color scheme — see `STATUS_STYLES` in the schedule page for the canonical mapping
- Server-side route handlers return `NextResponse.json(...)` with the right status; the token GET wrapper renders them as HTML
- Tests: write pure-function tests in a sibling `__tests__/` directory, mock DB at the boundary

## Project memory

Read `~/.claude/projects/-home-wiseyxd-Projects-shiftpilot/memory/` before non-trivial edits:
- `project_progress.md` — current state, env vars, how to run
- `feedback_shiftpilot_gotchas.md` — bugs we already fixed once

## Docs in the repo

- `PRODUCT.md` — full product reasoning for cofounders
- `PITCH.md` — 16-slide customer pitch deck

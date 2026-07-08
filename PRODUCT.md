# ShiftPilot — Product Overview

> AI-powered shift scheduling SaaS for cafes and restaurants. Replaces the manual mess of WhatsApp groups, Excel sheets, and last-minute panic calls with an autonomous scheduling agent that books shifts, finds replacements, and brokers swaps without the manager having to lift a finger.

---

## 1. The problem we're solving

Restaurant and cafe managers waste 4–8 hours every week on scheduling. The breakdown:

| Pain | Where time goes |
|---|---|
| **Building the rota** | Collecting availability from each employee individually (WhatsApp / texts / Excel sheets), then puzzling shifts together while respecting contracted hours, days off, role requirements, and fairness |
| **Last-minute changes** | An employee calls in sick at 7am for a 9am shift → manager scrambles, rings 5 people, hopes someone says yes |
| **Swap requests** | "Can I swap Friday with someone?" → manager becomes the human switchboard |
| **No-show after-the-fact** | Manager finds out at the start of the shift that no one's coming in |
| **Disputes** | "I never agreed to that shift" — no audit trail, manager loses the argument |

The current "solutions" — When I Work, Deputy, 7shifts — are scheduling **interfaces**, not scheduling **agents**. The manager still does all the thinking; the tool just helps them click less.

ShiftPilot is the first scheduling product where **the AI does the actual scheduling work** and the manager only approves the final result.

---

## 2. What we're building

A multi-tenant SaaS where:

1. **Owner signs up**, creates a location, adds shift templates (Morning / Afternoon / Evening etc.) and employees with contracted hours + roles
2. **Each week, the AI**:
   - Sends every employee a tokenised email to confirm or override their recurring availability
   - Generates the next week's schedule using gpt-4o, respecting roles, min/max hours, availability, fairness
   - Emails the manager a draft to approve
   - On approval, emails every employee their shifts with one-click accept/decline/swap/calendar links
3. **When something goes wrong** (sick call, decline, swap request):
   - Inngest workflow ranks replacement candidates (volunteers → under-hours → fairness-weighted)
   - Sends the top candidate an outreach email
   - Waits durably for their response, escalates to the next candidate on timeout
   - Pre-freeze swaps auto-approve; post-freeze swaps require manager confirmation
   - Every decision is written to an immutable audit log

Employees never log in. They only receive emails and click links. This is intentional — it removes adoption friction at the staff level, which is the #1 reason workforce tools fail in restaurants.

---

## 3. How it works — the autonomous loop

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    THE WEEKLY AUTONOMOUS LOOP                           │
└─────────────────────────────────────────────────────────────────────────┘

    [Wed]                    [Thu]                    [Mon next week]
      │                         │                            │
      ▼                         ▼                            ▼
 Inngest cron            Inngest cron              Employees work shifts
 sends availability      generates schedule         (live tracking)
 reminders to all        via gpt-4o, fires
 employees of every      schedule/approved
 location whose          event after manager
 generation day is       clicks Approve
 4 days away
                         Employees get
                         shift assignment
                         emails with
                         Accept / Decline /
                         Swap / Calendar links

                              │
                              ▼
 ┌─────────────────────────────────────────────────────┐
 │   When an employee declines or reports sick:        │
 │                                                     │
 │   ① replacement-engine fires                        │
 │   ② Ranks candidates (volunteer → under-hours →     │
 │      fairness)                                      │
 │   ③ Emails the top candidate                        │
 │   ④ step.waitForEvent durably (could be 2h)         │
 │   ⑤ Reassigns or escalates to next                  │
 │   ⑥ All candidates exhausted → emails the manager   │
 └─────────────────────────────────────────────────────┘
```

---

## 4. Key product decisions (the ones that matter)

| Decision | What we chose | Why |
|---|---|---|
| **Communication channel** | Email-only in v1 (WhatsApp in v2) | Resend is reliable + cheap; WhatsApp needs Business API approval per region |
| **Employee accounts** | None — tokenised email links | Adoption killer. Servers/baristas won't install another app |
| **AI model** | gpt-4o for generation, gpt-4o-mini for replacement | Big model only used once a week per location → keeps unit economics sane |
| **Background jobs** | Inngest (durable workflows) | Replacement loops can run for hours waiting on email clicks — Vercel functions can't |
| **Multi-tenancy** | Owner → many Locations → many Employees | One owner can run 3 cafes from one login |
| **Freeze window** | Configurable per location, default 24h | The "you can't decline 2h before your shift" rule that managers explicitly asked for |
| **Approval gate** | Manager must approve every generated schedule | We're confident in the AI but managers aren't yet — this is a trust ramp |
| **Audit log** | Every AI decision recorded with reasoning + candidates considered | Trust + dispute resolution. Manager can prove the AI tried 5 people before escalating |

---

## 5. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 App Router | Server Components + Server Actions = less plumbing |
| DB | Postgres on Neon | Branchable for dev/preview, scales for free tier |
| ORM | Prisma 7 (with Neon driver adapter) | Type-safe, generates client into repo |
| Auth | NextAuth v5 (credentials, JWT sessions) | No database session writes on every request |
| Background jobs | Inngest v4 | Durable step functions for the multi-hour replacement flows |
| Email | Resend + React Email | Beautiful templates, dev-overridable to one inbox |
| Payments | Stripe Billing + webhooks | Standard SaaS plumbing, we render our own pricing UI |
| AI | OpenAI gpt-4o + gpt-4o-mini | Determinstic fallback if API down (round-robin assignment) |
| Tests | Vitest | Pure functions tested in isolation; DB mocked at the boundary |
| UI | shadcn (Radix Luma) + Tailwind + Lucide | Boring tech that ships |

---

## 6. Data model

```
User (owner)
  └── Location (many)
        ├── Employee (many)            ← email, roles[], minHours, maxHours
        ├── ShiftTemplate (many)       ← Morning/Afternoon/Evening, requiredRoles[]
        ├── RecurringAvailability      ← employee × template × dayOfWeek baseline
        ├── AvailabilityOverride       ← per-week exceptions
        ├── Schedule (many)            ← weekStart + status (DRAFT/APPROVED/PUBLISHED)
        │     └── Shift (many)         ← template × employee × dayOfWeek × status
        │           └── SwapRequest    ← requester, proposedEmployee, status
        ├── AuditLog (append-only)     ← every AI action with reasoning
        └── ActionToken                ← one-time links for email actions

ActionToken can attach to either an Employee (shift accept/decline/swap)
or a User (manager approve/reject swap, approve schedule).
```

---

## 7. Business model

| Plan | Price | Limits | Target |
|---|---|---|---|
| **Trial** | Free, 14 days | Full Pro features | Lead generation |
| **Starter** | $29/mo | 1 location, ≤15 employees, fixed 24h freeze, 30-day audit | Single-site owner-operators |
| **Pro** | $79/mo | Unlimited locations + employees, configurable freeze, full audit history, analytics CSV export | Multi-site operators |

No free tier — restaurant tools have very low ARPU; we need every paid user. Trial qualifies the lead.

### Unit economics (rough)

- Avg restaurant: ~12 employees, generates ~21 shifts/week
- 1 schedule generation = ~3000 tokens gpt-4o = $0.03
- 4–6 replacement outreach emails/week = $0.005 (mostly Resend)
- Total monthly cost per location: **~$2** → 93% gross margin on Starter, 97% on Pro

---

## 8. Why we win

| Competitor | Their approach | What they miss |
|---|---|---|
| When I Work, Deputy | Schedule **builders** with drag-and-drop | Manager still does all the thinking and the chasing |
| 7shifts | Adds communication + tip pooling | Still manager-driven; replacements are manual |
| Sling | Free tier + paid features | No real automation; pretty calendar with chat |
| **ShiftPilot** | Autonomous **scheduling agent** | The whole point: manager only approves, AI does the rest |

The moat isn't the AI itself (anyone can call gpt-4o). The moat is:
1. **The durable workflow infrastructure** that makes the replacement engine reliable — most teams underestimate how hard it is to keep a multi-hour outreach loop running correctly across timeouts, double-clicks, declines, sick calls, and edge cases. We've solved this with Inngest.
2. **The audit log** — once managers trust the AI, they can never go back to a competitor that doesn't show its reasoning. This is sticky.
3. **The tokenised email UX** — no employee accounts, no app installs. The first product that makes scheduling tools usable by 50-year-old line cooks who don't want apps.

---

## 9. Status & roadmap

### Shipped (v1, current state)
- Multi-tenant auth (owner accounts only)
- Location / employee / shift template management
- Recurring availability + per-week overrides via tokenised email forms
- AI-generated schedules with manager approval flow
- Shift assignment emails (Accept / Decline / Swap / Add to Calendar)
- Replacement engine with priority-ranked outreach
- Swap broker with pre-freeze auto-approval, post-freeze manager approval
- Audit log with filterable AI decision history
- 4-KPI analytics dashboard + CSV export
- Stripe Billing integration

### Next (v2)
- WhatsApp Business API integration as a channel option
- Tip allocation + payroll export
- Mobile-friendly employee view (still no login required)
- Multi-week generation horizon (build 4 weeks at once)
- Predicted demand → headcount suggestions per shift

### Later
- POS integrations (Square, Toast) for demand-based scheduling
- Employee phone tree fallback for un-responded sick calls
- Multi-language email templates

---

## 10. Open questions

These need decisions before scaling:

- **Pricing experiments**: Is $29 too low for the value? Want to test $49.
- **Onboarding**: Currently the demo is for the manager to try the flow. Need a real onboarding wizard (import employees from CSV, pre-fill templates by venue type).
- **Failure mode**: What if Resend goes down during a sick-call replacement search? We need a fallback channel (SMS via Twilio?).
- **Verticals beyond cafes**: Same model works for retail, salons, daycare. Should we focus or expand?

---

## 11. How to demo it

1. `bun run dev`
2. `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`
3. Sign up → click **Try the demo** in the sidebar
4. Enter your email (all 4 demo employees will route to your inbox)
5. Approve the schedule → 4 emails land
6. Click **Decline** on one → watch the replacement engine in Inngest dev UI
7. Click **Yes, I'll take it** in the cover-up email → shift reassigned, audit log updated
8. Open **Audit log** tab → see every decision the AI made, with priority scores and fairness rationale

The whole thing takes 5 minutes to demo end-to-end.

---

## 12. Feature design — Staff-Sharing Marketplace (planned)

> Nearby gastronomy venues lend/borrow staff when their roster doesn't match demand.
> A venue that's **overstaffed + low traffic** offers its spare people; a venue that's
> **understaffed + high traffic** borrows them. This section captures the design
> decisions from the grilling session — it is **not yet built**.

### 12.1 The core loop

1. A venue's surplus or shortage is surfaced (AI-suggested; see 12.3).
2. The manager **confirms** a listing — or deliberately overrides (e.g. lends even when not comfortably overstaffed).
3. Nearby opt-in venues discover it (anonymized) and respond.
4. Both managers **and the lent worker** consent via tokenised links.
5. The deal is recorded; the borrowed worker appears on the borrower's roster, the lender's shift is marked `LENT_OUT`, and the agreed cost is logged.

### 12.2 Decisions locked in

| Area | Decision |
|---|---|
| **Counterparty** | Real **cross-owner** `Location`s — a true marketplace, not mock data |
| **Listing creation** | **AI suggests** surplus/shortage, **manager has final say** and can override |
| **Demand signal** | `expectedDemand` tag (QUIET/NORMAL/BUSY) per shift, manager-tunable + AI-prefilled; plus a **learned predictor** for required headcount |
| **Pre-deal exposure** | **Anonymized** — role/experience/rate/distance only; worker name/email revealed on accept (anti-poaching) |
| **Fulfillment** | New `SharingDeal` model + nullable `Shift.sharingDealId`; the borrowed shift keeps `employeeId = null` (no cross-tenant Employee FK, tenant isolation preserved) |
| **Consent** | **Both managers + the worker** must accept. Worker accepts via a tokenised email — reuses `ActionToken` + Inngest, upholds "employees never log in" |
| **WhatsApp** | A **tokenised ShiftPilot link is embedded in the `wa.me` message text**. Tapping it hits the existing `/api/token` handler and updates `SharingDeal.status`. The DB stays the source of truth — no plain `wa.me` blind spot, no WhatsApp Business API needed for v1 |
| **Matching** | **Ranked cross-venue outreach** mirroring `lib/inngest/outreach-loop.ts`: rank nearby venues by role/distance/rate, token-email the top one, `waitForEvent`, escalate on timeout |
| **Lender integrity** | A new **`LENT_OUT`** `ShiftStatus` that **always suppresses the backfill engine** (lending surplus needs no cover). Manager owns floor risk. NB: the freeze window does **not** gate the replacement engine — only swaps — so `LENT_OUT` is the only thing that stops a backfill cascade |
| **Money** | **Record-only ledger**: `SharingDeal` stores agreed rate × hours; the marketplace shows a running "you owe / you're owed" per counterparty + monthly statement. Venues settle offline. No Stripe Connect, no platform cut yet |
| **Geo / discovery** | `Location` gains `address/lat/lng`, `isDiscoverable` (**off by default**), `discoveryRadiusKm`; distance via Haversine; only opt-in venues within range appear |

### 12.3 Schema delta

- `ShiftStatus` += `LENT_OUT`
- `ActionTokenAction` += `ACCEPT_LOAN`, `DECLINE_LOAN`
- `Location` += `address String?`, `lat Float?`, `lng Float?`, `isDiscoverable Boolean @default(false)`, `discoveryRadiusKm Int @default(3)`
- `Shift` += `sharingDealId String?`
- new `SharingListing` — `type (OFFER|REQUEST)`, `role`, `date`, `window`, `employeeId?` (lender's, for offers), `rate?`, `status`
- new `SharingDeal` — `listingId`, lender/borrower `Location`, lender `employeeId`, `shiftId?`, `agreedRate?`, `status`

### 12.4 v1 scope (smallest testable slice)

The goal of v1 is to answer one question: **will a real venue actually lend / borrow?** So it's a thin vertical slice on **two real Locations**:

- Opt-in discovery (geocoded address + radius), privacy-on-by-default
- **Manual** post of a request or offer (offer picks a real `Employee`)
- Anonymized discovery cards for the counterparty
- Acceptance: borrower manager + lender manager agree, lender picks the worker, **worker token-accepts** → `SharingDeal.status = FILLED`
- On fill: lender's shift → `LENT_OUT` badge (no backfill); borrower's shortage shift → `sharingDealId` set, "Borrowed: {role} — {venue}" badge on the grid
- WhatsApp = a `wa.me` nudge carrying the token link

Reuses existing infra: `ActionToken` + token GET handler, `generateToken`/`generateManagerToken`, email templates, `step.waitForEvent`, `shift-date.ts`, `PageHeader`/`Card` conventions, and the sidebar `Marketplace` entry.

### 12.5 Deferred — explicitly NOT in v1

These were designed but **intentionally cut from v1** to avoid building unused machinery before demand is proven:

- **AI surplus/shortage suggestions** — v1 listings are created manually by the manager.
- **`expectedDemand` busyness tag** — no demand model in v1.
- **Learned headcount predictor** — the "AI learns the pattern and predicts required staff" piece; needs history + a model, comes after the loop is validated.
- **Ranked cross-venue auto-outreach (Inngest)** — v1 is manual discovery/accept; no automated same-day matching engine yet.
- **Lending an already-scheduled worker with auto-backfill** — v1 lends surplus only; the cascade behaviour (vacate → trigger replacement engine) is layered later. `LENT_OUT` status ships in v1 so the model is ready.
- **Cost ledger + monthly statements** — `SharingDeal` can store the rate, but the "you owe / you're owed" summaries and export are deferred.
- **Stripe Connect / payments / platform take-rate** — v1 is record-only; no money moves through the platform.
- **WhatsApp Business Cloud API** (native buttons + webhooks) — v1 uses the tokenised-link-in-`wa.me` approach instead.
- **Counter-offer / rate negotiation UI** — v1 takes the listed rate or "negotiable"; structured haggling is later.

### 12.6 ⚠️ Unresolved blocker — legal employer model

**Parked, but must be answered before any real venue uses this.** In Germany, commercially lending staff triggers **Arbeitnehmerüberlassung (AÜG)** and may require a Leiharbeit licence; otherwise the worker can be deemed an employee of the borrower, with fines for the lender. The whole "record-only ledger, lender stays the employer" model assumes the **occasional-lending exception** holds — that needs legal confirmation. Options considered: occasional-lending exception · borrower hires directly (mini-job) · platform becomes the licensed Verleiher · pure directory (no employment role). **This gates go-to-market, not the prototype.**

### 12.7 Other open risks (not yet decided)

- **No-show / liability**: who's responsible if a lent worker doesn't show — lender, borrower, or platform? Ties to the legal model.
- **Worker fairness/consent fatigue**: lent workers get extra outreach emails on top of their normal shifts — need a cap.
- **Insurance / accident cover** during a loan — undefined.
- **Anti-poaching enforcement** beyond anonymization — nothing stops a borrower recruiting the worker after they meet.

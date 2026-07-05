# ShiftPilot — Café-Owner Demo Playbook (Café Minou)

A scripted 15–20 minute walkthrough using the seeded demo café **Minou**
(login `julia@shiftt.com`). Every step names what to click and the one-liner
to say. Run `bun scripts/demo-minou.ts` before each demo to reset the stage.

---

## 0. Preparation (10 minutes before)

1. **Env**: make sure `.env` has `DEV_EMAIL_OVERRIDE=<the inbox you'll show on screen>`
   — every outgoing email (employee + manager) lands there. `OPENAI_API_KEY`
   must be set for the natural-language rules step.
2. **Reset the stage**:
   ```bash
   bun scripts/demo-minou.ts
   ```
3. **Start both servers** (two terminals):
   ```bash
   bun run dev
   npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
   ```
4. Open three browser tabs:
   - **A**: `http://localhost:3000` → log in as `julia@shiftt.com` → Minou
   - **B**: your override inbox (the live-email payoff)
   - **C**: `http://localhost:8288` (Inngest — the "engine room", show it once)

### What the seed staged

| Person | Setup | Demonstrates |
|---|---|---|
| Lena Vogel | Festangestellt, pinned Frühschicht Mon–Wed | pins, can't-decline category |
| Marco Ricci | Minijob at 22 €/h, 24h this week (~528 €) | Minijob cap warning (603 €) |
| Emma Fischer | 16 years old | JArbSchG badge + 40h legal max; also the open sick call |
| Tim Weber | Werkstudent | 20h legal cap |
| Sofia Peres | Minijob, vacation Tue–Wed next week, one no-show | vacations, no-show metric |
| Jonas Kraus | Fest, Sperrzeit: never Sundays | blocked times |
| Nina Albrecht | never confirmed availability | auto-drop from next week's plan |

Plus: current week PUBLISHED (lived-in), **next week DRAFT** (you approve it
live), and partner venue **Café Anker** 1.2 km away with an open staff
request (marketplace).

---

## The demo, step by step

### 1. Location dashboard — "everything that needs you, in one glance"
Open Minou's dashboard. Point at the two banners:
- **Amber**: *"Marco is approaching his Minijob 603 € cap — the system warned
  us before it becomes illegal."*
- **Red**: *"Emma called in sick. This banner and email reminders won't stop
  until I confirm I've seen it — no sick call ever drowns in a group chat."*
  Click **Confirm** — banner disappears (reminder loop stops itself).

### 2. Team roster — "the system knows German employment law"
Employees page. Point at the badges: **Minijob vs Fest/Teilzeit**,
**Minor — JArbSchG rules**, **Werkstudent**. One-liner: *"Categories change
how the scheduler treats people — minijobbers are only scheduled inside their
availability; Festangestellte can be scheduled freely and can't decline, only
request a change."*

### 3. Vacations — same page, Vacations card
Sofia is off Tue–Wed next week. *"On vacation means: never scheduled, never
asked to cover, never lent out."* Optionally add a vacation live over an
assigned shift — the amber warning shows the shifts were flagged and sent to
the replacement engine automatically.

### 4. Pins & Sperrzeiten — Shift templates page
Show the card: Lena pinned Mon–Wed Frühschicht (*"the human always wins —
only labour law can override a pin"*), Jonas never on Sundays. Try pinning
Jonas onto a Sunday → instant rejection naming the conflict.

### 5. Natural-language rules — back on the dashboard
In the **Scheduling rules** card type, in German:
> `Emma und Marco nie zusammen einplanen`

Click **Parse** → the system shows its interpretation → click **Correct — save
it**. One-liner: *"You talk to it like to a human — but the rule is enforced
by deterministic code, not by an AI's mood. The AI only translates."*

### 6. Hours & law — Analytics page
The hours table: **Assigned / contract Min–Max / Legal max** per person, with
the *source* of each limit: Emma "JArbSchG", Tim "Werkstudent", Marco
"Minijob cap" (with the near-limit badge). *"The binding limit is whichever
is smallest — the scheduler physically cannot cross these, and you see them
before they bite."* Scroll to the no-show table: Sofia 1 (real missed
check-in, not a guess).

### 7. The schedule — grid tour (current week)
Open the current week's schedule. Point at: status badges, the 📌 on Lena's
pinned shifts, the red **no-show** on Wednesday evening. *"Every state of a
shift is visible: accepted, reassigned by the AI, no-show, unfilled."*

### 8. Edit mode — "you always have the last word"
Open **next week's DRAFT** schedule. Note the amber card: *"Nina never
confirmed her availability by the deadline — the system dropped her rather
than guessing."* Click **Edit**:
- Try assigning **Emma to an Abendschicht** (17:00–22:00) → **hard block**:
  a 16-year-old must finish by 22:00 — the rule is named. *"This is not a
  warning, it's a wall. Labour law can't be overridden, not even by you."*
- Try assigning Sofia to Tuesday (her vacation) → **soft warning** with
  "Apply anyway". *"Your judgement beats soft rules — but never the law."*
  Click "No" / leave it.

### 9. Approve & the live email loop — the showpiece
Still on the DRAFT: click **Approve & notify employees**. Switch to tab B
(inbox):
- Minijobbers got **Accept / Decline** buttons; Festangestellte got an
  info-only mail with **Request a change** (no decline — by design).
- Click **Decline** in Marco's email → switch to tab C (Inngest): the
  **replacement engine** fires — it ranks legal, available candidates
  (excluding Sperrzeiten, vacations, anyone whose hours or rest a cover
  would break), emails the best one, and waits. Click **Accept** in that
  cover email → shift reassigned, confirmation with a calendar link arrives.
  *"No group-chat chaos. The system does the ring-around, one person at a
  time, and every decision lands in the audit log."*

### 10. Audit log — "the AI never acts in the dark"
Audit log page: schedule generation with reasoning, the compliance blocks,
the replacement outreach chain, your manual edit. *"Everything the system
did, why, and who was considered — Nachweisbarkeit built in."*

### 11. Marketplace — "borrow staff from the café next door"
Marketplace page: **Café Anker, 1.2 km away**, needs a Server on Friday
evening at 19 €/h — shown **anonymized** (no names until a deal is accepted —
anti-poaching). Respond by picking Sofia → both managers confirm → **Sofia
herself gets the final say** by tokenised email; a wa.me button nudges via
WhatsApp with the same link. On accept, her home shift flips to **lent out**
(the backfill engine deliberately leaves it alone) and she appears as
"Borrowed" on Anker's grid. *"Your talent pool is suddenly the whole
neighbourhood."*

### 12. Close
- *"Employees never install anything — everything is one tap in email
  (WhatsApp bot is on the roadmap, the links already work in wa.me)."*
- *"German labour law — ArbZG, JArbSchG, Minijob, Werkstudent — is enforced
  by deterministic code with versioned legal values, not by an AI guess."*
- *"You set rules in plain language, approve one plan a week, and get
  interrupted only when a human decision is genuinely needed."*

---

## Fallbacks & gotchas

- **Emails don't arrive** → check `DEV_EMAIL_OVERRIDE` and the Resend key;
  the Inngest tab (C) shows exactly which step failed.
- **Rule parsing fails** → needs `OPENAI_API_KEY`; retry once, or fall back to
  showing the already-enforced pin/Sperrzeit story (step 4).
- **Clicked too far / stage messy** → `bun scripts/demo-minou.ts` resets
  everything in ~10 seconds (safe to run mid-demo).
- The check-in cron sends real check-in emails ~40 min before seeded shifts
  if the servers are left running — harmless (they go to the override inbox),
  but expect a few extra mails there.
- Approving the draft twice does nothing bad — status guards refuse repeats.

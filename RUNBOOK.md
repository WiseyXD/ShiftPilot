# Demo-day runbook — Covrly

**The claim the demo exists to prove:** *the manager does nothing.*

**The moment that wins it:** Covrly **refuses three people out loud**, each for a
different German labour law, and asks the one person who may legally take the
shift. A system that says *no* — and names the statute — is the one thing a
mockup cannot fake.

Everything below runs on **production** (`https://shift-pilot-eight.vercel.app`)
over **real WhatsApp**. Your laptop is not in the loop.

---

## The cast

| Phone | Who | What it does on stage |
|---|---|---|
| `4915204520219` | **Niko** — Minijob | sends `sick` |
| `4915510221203` | **Vedika** — Minijob | **RINGS** — the only legal coverer |
| `4915123865499` | **Tim** — Werkstudent | **STAYS SILENT** — 22 h > the 20 h cap |

The shift: **Abendschicht, Tuesday, 17:00–22:00.** Niko's seat.

Covrly's three refusals, all produced by `lib/compliance/` — not scripted:

- **Lina**, 15 — *JArbSchG: shift ends 22:00, a 15-year-old must finish by 20:00*
- **Tim**, Werkstudent — *22.00 h this week exceeds the 20 h lecture-time limit*
- **Marco**, Minijob — *630 € this month would exceed the 603 € cap*

Tim and Marco are the two your audience has personally *been*.

---

## T-30 minutes

```bash
bun scripts/demo-camondas.ts
```

Re-stages the **live site** (production shares the same Neon database) and
verifies itself. It must print:

```
Niko has exactly 1 upcoming shift — he cannot tap the wrong one.
   ✗ Lina    NIGHT_CUTOFF …
   ✗ Tim     WERKSTUDENT_WEEKLY …   📵 4915123865499 stays SILENT
   ✗ Marco   MINIJOB_CAP …
   ✓ Vedika  legal → Covrly asks Vedika   📱 4915510221203 RINGS

Stage is correct: three refusals, one ask.
```

**If it does not say "Stage is correct", do not go on.** Something drifted.

### Open the 24-hour window — the step that silently kills the demo

WhatsApp only lets a business send free-form messages **within 24 h of the user
last messaging it**. Outside that window Meta rejects the send with `131047`
— no error on screen, the message simply never arrives.

**From all three phones, text anything to `+1 555-146-3372`.** "hi" is enough.

While you're there: **have Tim's phone text `my shifts`.** Covrly answers, which
proves that handset is live and registered — so when it stays silent later, the
silence is *evidence*, not "maybe it's not connected." This kills the only
heckle available to a sceptic.

---

## The 60 seconds

Three phones face-up on the doc-cam. Manager's dashboard on the projector.
**Your hands never touch the keyboard.**

| | Do | Say |
|---|---|---|
| 1 | Niko's phone: text **`sick`** | *"Niko wakes up ill. He texts our WhatsApp number."* |
| 2 | One option appears. Tap **`Tue 21 Jul · Abend`** | *"He taps the shift. That's the last human input in this demo."* |
| 3 | *(wait ~5 s — let it breathe)* | *"Covrly is now ringing round the team. It won't ask Lina — she's fifteen, that shift ends at ten. It won't ask Tim — he's a Werkstudent, that'd put him over twenty hours. It won't ask Marco — he'd blow his Minijob limit."* |
| 4 | Point at **Tim's silent phone** | *"Tim's phone is right here. It did not ring. That's not a preference — it's the law, and the code physically cannot cross it."* |
| 5 | **Vedika's phone buzzes.** Tap **`🙋 Yes, I can`** | *"It asks the one person who legally can. She taps yes."* |
| 6 | Dashboard grid updates itself | *"Covered. Logged. The manager was asleep for all of it."* |

**Close:** *"Zero phone calls. Zero manager. And it is not allowed to break German labour law — watch it refuse."*

---

## While the workflow thinks

There is a real durable workflow running (Inngest Cloud), so there will be a
couple of seconds of latency. **Do not fill it with silence, and do not
apologise for it.** Use it:

> *"That pause is real work — it's ranking the team by who's owed hours, then
> running every candidate through the compliance engine before it dares send a
> message."*

Latency is a *credibility asset*. Mocks are instant.

---

## If it breaks

| Symptom | Cause | Do this |
|---|---|---|
| No WhatsApp arrives at all | 24 h service window closed (`131047`) | Text the bot from that phone, retry. **This is the #1 failure.** |
| Nothing arrives, ever | Phone not on Meta's test-number allowlist | Meta console → WhatsApp → API Setup → Manage phone number list |
| Sick call confirmed, no cover request | Inngest not running the workflow | `curl https://shift-pilot-eight.vercel.app/api/inngest` → `mode` must be `cloud`. Check app.inngest.com for a failed run. |
| Dates are one day off | The server lost `Europe/Berlin` | `instrumentation.ts` sets `process.env.TZ`. Vercel is UTC and **ignores the `TZ` env var** — the fix must be in code. |
| Wrong person gets asked | Niko had >1 upcoming shift and the wrong one was tapped | Re-run the seed; it asserts exactly one. |
| **Total wifi failure** | — | **Fallback: the in-app WhatsApp simulator** (`/dashboard/[locationId]/whatsapp`). Same brain, same guards, same compliance engine — only the transport differs. Drive the identical story from the browser. |

**Never debug on stage.** If the loop stalls past ~15 seconds, switch to the
simulator tab and keep talking. The story is identical; only the transport changed.

---

## What to hand a sceptic

- *"Is the WhatsApp real?"* — Hand them a phone. Let them text it. The number is
  public and the system has no idea who they are.
- *"Is the compliance real or a prompt?"* — `lib/compliance/` is deterministic
  code with versioned legal values. The LLM only translates plain-language rules
  into it; it never decides legality. 207 tests.
- *"Did you fake the refusals?"* — The seed script re-derives them live by
  calling the same `checkEmployeeAssignment` the replacement engine calls. It
  refuses to run if the stage doesn't produce them.
- *"What if the AI schedules someone illegally?"* — It can't. The wall is not a
  warning; it's a wall. Try it in the schedule editor.

---

## Known sharp edges (be honest if asked)

- **One timezone.** The whole app assumes Europe/Berlin. A café elsewhere breaks
  the date model today. Fixable, not fixed.
- **Meta test number.** Free tier, five allowlisted recipients, 24 h windows.
  A production sender needs business verification (days) and a payment method.
- **No real café yet.** Every name on that grid is seeded.


# ShiftPilot MVP Plan

## 🧱 Tech Architecture

* **Frontend (UI):**

  * Next.js (App Router)
  * Tailwind CSS

* **Backend:**

  * Option A (faster MVP): Next.js API routes / Server Actions
  * Option B (cleaner scale): Separate Node.js / Bun service (recommended if time permits)

* **Database:**

  * PostgreSQL + Prisma ORM

* **LLM Layer:**

  * LangChain (for structured parsing + agent flow)
  * OpenAI (or equivalent)

* **Email सेवा:**

  * Resend / SendGrid (with webhook support for replies)

* **Queue (optional but useful):**

  * BullMQ / simple async jobs (for handling email + rescheduling)

---

## 🚀 Implementation Plan (in order)

### ✅ Phase 1: Project Setup

* [ ] Initialize Next.js app (App Router)
* [ ] Setup Tailwind CSS
* [ ] Setup Prisma + PostgreSQL
* [ ] Define core database schema:

  * [ ] Employee
  * [ ] Availability
  * [ ] Shift
  * [ ] Schedule
  * [ ] Message / Reply logs

---

### ✅ Phase 2: Employee Management

* [ ] Build UI to add/edit employees
* [ ] Add availability input (days + shift preference)
* [ ] Store in database
* [ ] Basic validation

---

### ✅ Phase 3: Schedule Generation (Core Logic)

* [ ] Define shift structure (e.g., Morning / Evening)
* [ ] Implement basic scheduling algorithm:

  * [ ] Match availability
  * [ ] Ensure coverage
  * [ ] Distribute shifts fairly
* [ ] Store generated schedule in DB
* [ ] Build “Generate Schedule” button

---

### ✅ Phase 4: Schedule UI

* [ ] Create weekly table view (Days × Shifts)
* [ ] Show assigned employees
* [ ] Make it clean and readable (important for demo)

---

### ✅ Phase 5: Email Notifications

* [ ] Integrate email service (Resend/SendGrid)
* [ ] Send schedule emails to employees
* [ ] Include clear instruction:

  * “Reply if you cannot attend”

---

### ✅ Phase 6: Reply Handling (CRITICAL FEATURE)

* [ ] Setup webhook to receive email replies
* [ ] Store raw replies in database
* [ ] Use LangChain + LLM to parse replies into structured JSON:

  * intent (unavailable / swap)
  * day
  * shift

---

### ✅ Phase 7: Auto-Rescheduling Logic

* [ ] On “unavailable” intent:

  * [ ] Find replacement employee:

    * Available
    * Least assigned shifts
  * [ ] Update schedule
* [ ] Persist updated schedule

---

### ✅ Phase 8: Notifications on Change

* [ ] Notify:

  * [ ] Removed employee
  * [ ] New assigned employee
* [ ] Send updated shift details via email

---

### ✅ Phase 9: Manager Command Input (AI Layer)

* [ ] Add input box / chat UI
* [ ] Accept commands like:

  * “Fix Friday evening shift”
* [ ] Use LangChain to:

  * Parse intent
  * Trigger backend actions (regenerate / reassign)

---

### ✅ Phase 10: Basic Agent Loop

* [ ] Flow:

  * Send schedule → receive reply → parse → update → notify
* [ ] Ensure loop works reliably for demo

---

## 🧠 Optional Enhancements (only if time permits)

* [ ] Add explanation layer:

  * “Assigned John because fewer hours”
* [ ] Add manual override in UI
* [ ] Add shift swap support between employees
* [ ] Add simple dashboard stats

---

## ⚠️ Key Focus While Building

* Keep UI minimal, functional > pretty
* Make reply parsing reliable (this is your differentiator)
* Ensure end-to-end flow works without breaking
* Optimize for demo, not perfection

---

## 🎯 Final Goal of MVP

* Manager clicks → schedule generated
* Employees receive email
* One reply triggers automatic rescheduling
* System updates + notifies everyone

👉 If this works smoothly, the product is convincing.

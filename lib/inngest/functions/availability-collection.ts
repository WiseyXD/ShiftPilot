import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { needsAvailability } from "@/lib/scheduling/categories"
import { pushAgentMessage, type ChatAction } from "@/lib/whatsapp-sim/handler"
import { pushOwnerMessage, ownerThreadLanguage } from "@/lib/agent/owner-thread"
import { t, fmtDate, DAY_LABELS } from "@/lib/agent/i18n"

// Phase 1 of "Generate": before building anything, ask the team (in WhatsApp)
// what they can't work next week. The chat handler fires generation directly
// once every gated employee has replied — no email, no fragile cross-workflow
// wait. This function only owns the ask + a safety-net: if replies never
// complete, generate anyway after a window (non-responders get dropped by
// partitionSchedulable, as the weekly cron already does).
export const availabilityCollection = inngest.createFunction(
  {
    id: "availability-collection",
    triggers: [{ event: "schedule/collect-availability" }],
  },
  async ({ event, step }) => {
    const { locationId } = event.data as { locationId: string }
    const weekStart = nextMonday(new Date())
    const ms = weekStart.getTime()

    const location = await step.run("load-location", () =>
      prisma.location.findUnique({
        where: { id: locationId },
        include: {
          employees: {
            include: {
              recurringAvailability: { include: { shiftTemplate: true } },
            },
          },
        },
      })
    )
    if (!location) return { error: "Location not found" }

    const gatedCount = location.employees.filter((e) => needsAvailability(e.category)).length

    await step.run("ask-team", async () => {
      for (const employee of location.employees) {
        const gated = needsAvailability(employee.category)

        // "❌ Can't work" button per usual slot — built from what they normally
        // can work, so the question is "which of these is off next week?".
        const slotButtons: ChatAction[] = gated
          ? [...employee.recurringAvailability]
              .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
              .map((ra) => ({
                label: `❌ ${DAY_LABELS.en[ra.dayOfWeek]} ${ra.shiftTemplate.name}`,
                command: `AVAIL_NO:${ra.shiftTemplateId}:${ra.dayOfWeek}:${ms}`,
              }))
          : []

        await pushAgentMessage(
          locationId,
          employee.id,
          gated
            ? `📅 The schedule for the week of ${fmtDate("en", weekStart)} is being built.\n\nWhat *can't* you work next week? Tap "All good" or mark a shift — or just text me (e.g. "can't do Wednesday evening").`
            : `📅 The schedule for the week of ${fmtDate("en", weekStart)} is being built. If there's anything you *can't* work next week, just text me — otherwise I'll schedule you as usual.`,
          [{ label: "✅ All good", command: `AVAIL_OK:${ms}` }, ...slotButtons]
        )
      }

      const lang = await ownerThreadLanguage(locationId)
      await pushOwnerMessage(locationId, t(lang).collectingAvailability(fmtDate(lang, weekStart), gatedCount))
    })

    // Safety net only. The happy path is the chat handler firing
    // `schedule/manual-generate` the moment the last reply lands. If some never
    // reply, generate anyway after the window — unless a draft already exists.
    await step.sleep("await-replies", "12h")

    const alreadyDrafted = await step.run("check-drafted", () =>
      prisma.schedule.count({ where: { locationId, weekStart } })
    )
    if (alreadyDrafted === 0) {
      await step.run("fallback-generate", () =>
        inngest.send({ name: "schedule/manual-generate", data: { locationId } })
      )
    }

    return { asked: location.employees.length, gatedCount }
  }
)

function nextMonday(from: Date): Date {
  const d = new Date(from)
  const day = d.getDay()
  const diff = day === 1 ? 7 : (8 - day) % 7
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

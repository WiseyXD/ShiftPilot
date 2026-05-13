import { prisma } from "@/prisma/client"
import { notFound } from "next/navigation"
import { OverrideForm } from "./form"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export default async function OverridePage({
  params,
}: {
  params: Promise<{ tokenId: string }>
}) {
  const { tokenId } = await params

  const token = await prisma.actionToken.findUnique({
    where: { id: tokenId },
    include: {
      employee: {
        include: {
          recurringAvailability: true,
          location: {
            include: { shiftTemplates: { orderBy: { startTime: "asc" } } },
          },
        },
      },
    },
  })

  if (
    !token ||
    token.action !== "SUBMIT_AVAILABILITY" ||
    token.usedAt ||
    token.expiresAt < new Date() ||
    !token.employee
  ) {
    notFound()
  }

  const payload = token.payload as { weekStart: string }
  const weekStart = new Date(payload.weekStart)

  const { employee } = token as typeof token & { employee: NonNullable<typeof token.employee> }
  const templates = employee.location.shiftTemplates

  // Build the 7 dates for this week
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  // Build recurring availability set for pre-fill
  const recurringSet = new Set(
    employee.recurringAvailability.map((a) => `${a.shiftTemplateId}:${a.dayOfWeek}`)
  )

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Next week&apos;s availability</h1>
          <p className="text-slate-500 mt-1">
            Hi {employee.name} — any changes from your usual pattern? Untick shifts you won&apos;t
            be available for, or tick extras. No changes? Just click save.
          </p>
        </div>

        <OverrideForm
          tokenId={tokenId}
          employeeId={employee.id}
          weekStart={weekStart.toISOString()}
          templates={templates}
          weekDates={weekDates.map((d) => d.toISOString())}
          days={DAYS}
          recurringSet={recurringSet}
        />
      </div>
    </div>
  )
}

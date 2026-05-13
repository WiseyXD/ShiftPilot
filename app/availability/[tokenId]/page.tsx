import { prisma } from "@/prisma/client"
import { notFound } from "next/navigation"
import { AvailabilityForm } from "./form"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export default async function AvailabilityPage({
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
          location: {
            include: { shiftTemplates: { orderBy: { startTime: "asc" } } },
          },
          recurringAvailability: true,
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

  const { employee } = token as typeof token & { employee: NonNullable<typeof token.employee> }
  const existingSlots = new Set(
    employee.recurringAvailability.map((a) => `${a.shiftTemplateId}:${a.dayOfWeek}`)
  )

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Set your availability
          </h1>
          <p className="text-slate-500 mt-1">
            Hi {employee.name} — tick the shifts you&apos;re regularly available for at{" "}
            <strong>{employee.location.name}</strong>.
          </p>
        </div>

        <AvailabilityForm
          tokenId={tokenId}
          employeeId={employee.id}
          templates={employee.location.shiftTemplates}
          days={DAYS}
          existingSlots={existingSlots}
        />
      </div>
    </div>
  )
}

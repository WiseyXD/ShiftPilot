import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import type { ShiftStatus } from "@/prisma/generated/client/client"

function currentMonday(): Date {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

const DEMO_TEMPLATES = [
  { name: "Morning", startTime: "07:00", endTime: "15:00", requiredRoles: ["Barista"] },
  { name: "Afternoon", startTime: "12:00", endTime: "20:00", requiredRoles: ["Barista"] },
  { name: "Evening", startTime: "15:00", endTime: "23:00", requiredRoles: ["Barista"] },
]

const DEMO_NAMES = ["Alice", "Bob", "Carol", "Dave"]

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Guard against stale JWT pointing to a wiped DB user
  const userExists = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } })
  if (!userExists) {
    return NextResponse.json(
      { error: "SESSION_STALE" },
      { status: 401 }
    )
  }

  const body = await req.json() as { email?: string; reset?: boolean }

  // Reset = delete only, no create. User clicks "Set up demo" afterward to create fresh.
  if (body.reset) {
    const demo = await prisma.location.findFirst({
      where: { ownerId: session.user.id, name: "Demo Café" },
      include: { schedules: { select: { id: true } } },
    })
    if (demo) {
      const scheduleIds = demo.schedules.map((s) => s.id)
      if (scheduleIds.length) {
        await prisma.shift.deleteMany({ where: { scheduleId: { in: scheduleIds } } })
      }
      await prisma.location.delete({ where: { id: demo.id } })
    }
    return NextResponse.json({ ok: true, deleted: true })
  }

  const email = body.email?.trim()
  if (!email) {
    return NextResponse.json({ error: "An email address is required" }, { status: 400 })
  }

  // Use placeholder addresses to satisfy the unique DB constraint.
  // DEV_EMAIL_OVERRIDE in .env redirects all actual sends to the one real address.
  const emails = DEMO_NAMES.map((name) => `demo-${name.toLowerCase()}@shiftpilot.local`)

  // Check if demo already exists (after optional reset above)
  const existing = await prisma.location.findFirst({
    where: { ownerId: session.user.id, name: "Demo Café" },
    include: { schedules: { orderBy: { createdAt: "desc" }, take: 1 } },
  })
  if (existing) {
    return NextResponse.json({
      locationId: existing.id,
      scheduleId: existing.schedules[0]?.id ?? null,
      alreadyExists: true,
    })
  }


  // 1. Create location
  const location = await prisma.location.create({
    data: {
      ownerId: session.user.id,
      name: "Demo Café",
      timezone: "Europe/London",
      generationDayOfWeek: 4,
      freezeWindowHours: 2, // demo: only freeze the last 2h before a shift
      escalationTimeoutHours: 1, // 1h per candidate — short enough to see the flow during a demo
    },
  })

  // 2. Create shift templates
  const templates = await Promise.all(
    DEMO_TEMPLATES.map((t) =>
      prisma.shiftTemplate.create({
        data: { locationId: location.id, ...t },
      })
    )
  )

  // 3. Create employees
  const employees = await Promise.all(
    emails.map((email, i) =>
      prisma.employee.create({
        data: {
          locationId: location.id,
          name: DEMO_NAMES[i] ?? `Employee ${i + 1}`,
          email,
          roles: ["Barista"],
          minHours: 20,
          maxHours: 40,
        },
      })
    )
  )

  // 4. Set availability: all employees available every day for all templates
  await prisma.recurringAvailability.createMany({
    data: employees.flatMap((emp) =>
      templates.flatMap((tmpl) =>
        [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          employeeId: emp.id,
          shiftTemplateId: tmpl.id,
          dayOfWeek,
        }))
      )
    ),
  })

  // 5. Create schedule for current week
  const weekStart = currentMonday()
  const schedule = await prisma.schedule.create({
    data: {
      locationId: location.id,
      weekStart,
      status: "DRAFT",
    },
  })

  // 6. Assign shifts Sun–Sat, round-robin employees across every (day × template) slot
  let empIdx = 0
  const shifts: { scheduleId: string; shiftTemplateId: string; employeeId: string; dayOfWeek: number; status: ShiftStatus }[] = []

  for (let day = 0; day <= 6; day++) { // 0=Sun … 6=Sat
    for (const tmpl of templates) {
      const emp = employees[empIdx % employees.length]
      empIdx++
      shifts.push({
        scheduleId: schedule.id,
        shiftTemplateId: tmpl.id,
        employeeId: emp.id,
        dayOfWeek: day,
        status: "PENDING",
      })
    }
  }

  await prisma.shift.createMany({ data: shifts })

  return NextResponse.json({ locationId: location.id, scheduleId: schedule.id })
}

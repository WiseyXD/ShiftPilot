// Demo seed for Café Minou (julia@shiftt.com). Re-runnable: wipes Minou's
// child data and rebuilds a rich demo state. Run: bun scripts/demo-minou.ts

import { prisma } from "../prisma/client"
import { hash } from "bcryptjs"

const OWNER_EMAIL = "julia@shiftt.com"
const PARTNER_EMAIL = "anker@shift.demo"

// Monday of the current week (local), and next week's Monday.
const monday = (offsetWeeks = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7)
  d.setHours(0, 0, 0, 0)
  return d
}

async function main() {
  const julia = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
    include: { locations: true },
  })
  if (!julia) throw new Error(`${OWNER_EMAIL} not found`)
  const minou = julia.locations.find((l) => l.name === "Minou")
  if (!minou) throw new Error("Location 'Minou' not found")

  // ── Reset Minou's demo data ────────────────────────────────────────────────
  await prisma.shift.deleteMany({ where: { schedule: { locationId: minou.id } } })
  await prisma.schedule.deleteMany({ where: { locationId: minou.id } })
  await prisma.sickCall.deleteMany({ where: { locationId: minou.id } })
  await prisma.fixedShift.deleteMany({ where: { locationId: minou.id } })
  await prisma.blockedTime.deleteMany({ where: { locationId: minou.id } })
  await prisma.vacation.deleteMany({ where: { locationId: minou.id } })
  await prisma.managerRule.deleteMany({ where: { locationId: minou.id } })
  await prisma.sharingListing.deleteMany({ where: { locationId: minou.id } })
  await prisma.employee.deleteMany({ where: { locationId: minou.id } })
  await prisma.shiftTemplate.deleteMany({ where: { locationId: minou.id } })
  // Partner venue from previous runs
  await prisma.user.deleteMany({ where: { email: PARTNER_EMAIL } })

  // ── Minou itself: Berlin address, discoverable, demo-friendly timings ─────
  await prisma.location.update({
    where: { id: minou.id },
    data: {
      timezone: "Europe/Berlin",
      address: "Kastanienallee 42, 10435 Berlin",
      lat: 52.5387,
      lng: 13.4106,
      isDiscoverable: true,
      discoveryRadiusKm: 3,
      escalationTimeoutHours: 1, // replacement escalates fast during a demo
      checkInGraceMinutes: 15,
    },
  })

  // ── Shift templates ────────────────────────────────────────────────────────
  const frueh = await prisma.shiftTemplate.create({
    data: { locationId: minou.id, name: "Frühschicht", startTime: "07:00", endTime: "13:00", minHeadcount: 2, requiredRoles: ["Barista", "Service"] },
  })
  const mittag = await prisma.shiftTemplate.create({
    data: { locationId: minou.id, name: "Mittagsschicht", startTime: "12:00", endTime: "17:00", minHeadcount: 1, requiredRoles: ["Service"] },
  })
  const abend = await prisma.shiftTemplate.create({
    data: { locationId: minou.id, name: "Abendschicht", startTime: "17:00", endTime: "22:00", minHeadcount: 2, requiredRoles: ["Service", "Kitchen"] },
  })

  // ── Team: every category/status the product knows ─────────────────────────
  const mk = (data: Parameters<typeof prisma.employee.create>[0]["data"]) =>
    prisma.employee.create({ data })

  const lena = await mk({
    locationId: minou.id, name: "Lena Vogel", email: "lena@minou.demo",
    roles: ["Service", "Barista"], category: "TEILZEIT_FEST", minHours: 18, maxHours: 40,
    hourlyWageCents: 1650, wishWeight: "LOW",
  })
  const marco = await mk({
    locationId: minou.id, name: "Marco Ricci", email: "marco@minou.demo",
    roles: ["Barista"], category: "MINIJOB_ZEITARBEIT", minHours: 0, maxHours: 40,
    hourlyWageCents: 2200, wishWeight: "MEDIUM", // 22 €/h → the Minijob cap binds (~27h), not the contract
  })
  const emma = await mk({
    locationId: minou.id, name: "Emma Fischer", email: "emma@minou.demo",
    roles: ["Service"], category: "MINIJOB_ZEITARBEIT", minHours: 0, maxHours: 45,
    hourlyWageCents: 1390, birthDate: new Date("2010-03-12T00:00:00Z"), // 16 → JArbSchG 40h binds
  })
  const tim = await mk({
    locationId: minou.id, name: "Tim Weber", email: "tim@minou.demo",
    roles: ["Barista", "Kitchen"], category: "TEILZEIT_FEST", minHours: 10, maxHours: 38,
    hourlyWageCents: 1500, isWerkstudent: true, // Werkstudent 20h binds, not the contract
  })
  const sofia = await mk({
    locationId: minou.id, name: "Sofia Peres", email: "sofia@minou.demo",
    roles: ["Service"], category: "MINIJOB_ZEITARBEIT", minHours: 0, maxHours: 20,
    hourlyWageCents: 1390,
  })
  const jonas = await mk({
    locationId: minou.id, name: "Jonas Kraus", email: "jonas@minou.demo",
    roles: ["Kitchen", "Service"], category: "TEILZEIT_FEST", minHours: 12, maxHours: 40,
    hourlyWageCents: 1750, wishWeight: "LOW",
  })
  const nina = await mk({
    locationId: minou.id, name: "Nina Albrecht", email: "nina@minou.demo",
    roles: ["Barista"], category: "MINIJOB_ZEITARBEIT", minHours: 0, maxHours: 15,
    hourlyWageCents: 1390, // she "never confirmed" → auto-dropped next week
  })

  // Recurring availability (the wish signal for minijobbers)
  const avail = async (employeeId: string, shiftTemplateId: string, days: number[]) => {
    for (const dayOfWeek of days) {
      await prisma.recurringAvailability.create({ data: { employeeId, shiftTemplateId, dayOfWeek } })
    }
  }
  await avail(marco.id, frueh.id, [1, 2, 3, 4, 5])
  await avail(marco.id, mittag.id, [1, 2, 3])
  await avail(emma.id, frueh.id, [1, 2, 3, 4, 5]) // minor: early shifts only
  await avail(sofia.id, mittag.id, [2, 3, 4, 5, 6])
  await avail(sofia.id, abend.id, [2, 3, 4, 5, 6])
  await avail(nina.id, frueh.id, [6, 0])

  // ── Manager controls ───────────────────────────────────────────────────────
  // Lena is pinned to the early shift Mon–Wed, every week.
  for (const day of [1, 2, 3]) {
    await prisma.fixedShift.create({
      data: { locationId: minou.id, employeeId: lena.id, shiftTemplateId: frueh.id, dayOfWeek: day, weekStart: null },
    })
  }
  // Jonas never works Sundays.
  await prisma.blockedTime.create({
    data: { locationId: minou.id, employeeId: jonas.id, shiftTemplateId: null, dayOfWeek: 0 },
  })
  // Sofia on vacation Tue–Wed next week.
  const nextMon = monday(1)
  await prisma.vacation.create({
    data: {
      locationId: minou.id, employeeId: sofia.id,
      startDate: new Date(Date.UTC(nextMon.getFullYear(), nextMon.getMonth(), nextMon.getDate() + 1)),
      endDate: new Date(Date.UTC(nextMon.getFullYear(), nextMon.getMonth(), nextMon.getDate() + 2)),
    },
  })

  // ── Current week: PUBLISHED, lived-in (history for analytics + hours) ─────
  const thisMon = monday(0)
  const current = await prisma.schedule.create({
    data: { locationId: minou.id, weekStart: thisMon, status: "PUBLISHED" },
  })
  const shift = (
    scheduleId: string,
    tmplId: string,
    employeeId: string | null,
    dayOfWeek: number,
    status: "PENDING" | "ACCEPTED" | "DECLINED" | "REASSIGNED" | "UNASSIGNED" | "NO_SHOW"
  ) => prisma.shift.create({ data: { scheduleId, shiftTemplateId: tmplId, employeeId, dayOfWeek, status } })

  // Lena: pinned Früh Mon–Wed. Marco: 4× Früh (24h × 22 € = 528 € → cap warning).
  for (const d of [1, 2, 3]) await shift(current.id, frueh.id, lena.id, d, "ACCEPTED")
  for (const d of [1, 2, 3, 4]) await shift(current.id, frueh.id, marco.id, d, "ACCEPTED")
  await shift(current.id, frueh.id, emma.id, 4, "ACCEPTED")
  await shift(current.id, frueh.id, emma.id, 5, "ACCEPTED")
  await shift(current.id, mittag.id, sofia.id, 2, "ACCEPTED")
  await shift(current.id, mittag.id, sofia.id, 4, "REASSIGNED")
  await shift(current.id, mittag.id, tim.id, 1, "ACCEPTED")
  await shift(current.id, mittag.id, tim.id, 3, "ACCEPTED")
  for (const d of [1, 2, 4, 5]) await shift(current.id, abend.id, jonas.id, d, "ACCEPTED")
  await shift(current.id, abend.id, sofia.id, 3, "NO_SHOW") // feeds the analytics table
  await shift(current.id, abend.id, null, 6, "UNASSIGNED")

  // One unconfirmed sick call → red dashboard banner.
  const sickShift = await shift(current.id, frueh.id, emma.id, 6, "DECLINED")
  await prisma.sickCall.create({
    data: { locationId: minou.id, shiftId: sickShift.id, employeeId: emma.id },
  })

  // ── Next week: DRAFT — approve it LIVE in the demo ────────────────────────
  const draft = await prisma.schedule.create({
    data: {
      locationId: minou.id,
      weekStart: nextMon,
      status: "DRAFT",
      notes: {
        autoDropped: [
          { employeeId: nina.id, name: "Nina Albrecht", reason: "no availability confirmation by the deadline" },
        ],
      },
    },
  })
  for (const d of [1, 2, 3]) await shift(draft.id, frueh.id, lena.id, d, "PENDING") // pins
  for (const d of [1, 2]) await shift(draft.id, frueh.id, marco.id, d, "PENDING")
  for (const d of [4, 5]) await shift(draft.id, frueh.id, emma.id, d, "PENDING")
  for (const d of [1, 3, 5]) await shift(draft.id, mittag.id, tim.id, d, "PENDING")
  for (const d of [1, 2, 3, 4, 6]) await shift(draft.id, abend.id, jonas.id, d, "PENDING") // never Sunday
  for (const d of [4, 5, 6]) await shift(draft.id, abend.id, sofia.id, d, "PENDING") // vacation Tue/Wed avoided
  await shift(draft.id, frueh.id, null, 6, "UNASSIGNED")
  await shift(draft.id, mittag.id, null, 0, "UNASSIGNED")
  await shift(draft.id, abend.id, null, 0, "UNASSIGNED")

  // ── Partner venue for the marketplace story ───────────────────────────────
  // Log-in-able: the marketplace demo needs the Anker manager in a second browser.
  const anker = await prisma.user.create({
    data: {
      email: PARTNER_EMAIL,
      passwordHash: await hash("demo1234", 12),
      trialEndsAt: new Date(Date.now() + 90 * 86400000),
    },
  })
  const ankerLoc = await prisma.location.create({
    data: {
      ownerId: anker.id, name: "Café Anker", timezone: "Europe/Berlin",
      address: "Torstraße 99, 10119 Berlin", lat: 52.529, lng: 13.401,
      isDiscoverable: true, discoveryRadiusKm: 5,
    },
  })
  // Anker is short a server on Friday evening → shows up anonymized in Julia's feed.
  const friday = new Date(Date.UTC(nextMon.getFullYear(), nextMon.getMonth(), nextMon.getDate() + 4))
  await prisma.sharingListing.create({
    data: {
      locationId: ankerLoc.id, type: "REQUEST", role: "Service",
      date: friday, startTime: "18:00", endTime: "23:00", hourlyRateCents: 1900, status: "OPEN",
    },
  })

  console.log("Minou demo seeded ✅")
  console.log(`  location: ${minou.id}`)
  console.log(`  employees: 7 · templates: 3 · schedules: current (PUBLISHED) + next (DRAFT)`)
  console.log(`  partner venue: Café Anker (${PARTNER_EMAIL} / demo1234) with 1 open listing`)
}

main()

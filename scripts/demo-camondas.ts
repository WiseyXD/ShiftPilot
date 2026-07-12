// Demo-day seed for Camondas (aryan.s.nag@gmail.com). Re-runnable: wipes the
// café's child data and rebuilds the exact stage the pitch needs.
//
//   bun scripts/demo-camondas.ts
//
// The story it stages: Niko calls in sick from a REAL phone for next Tuesday's
// Abendschicht (17:00–22:00). Covrly looks for cover and refuses three people
// — each for a different named law — before asking the one person who may
// legally take it:
//
//   Lina   15 y/o    → JArbSchG: must finish by 20:00, the shift ends at 22:00
//   Tim    Werkstudent → 20 h/week cap during lecture time
//   Marco  Minijob   → the 603 €/month earnings cap
//   Vedika           → legal, free, rested  ⇒ SHE GETS THE WHATSAPP
//
// Every one of those refusals is produced by the real compliance engine, not
// scripted here. The verification block at the bottom proves it by running the
// same check the replacement engine runs — if the stage is wrong, this script
// tells you before you walk on stage.

import { prisma } from "../prisma/client"
import { checkEmployeeAssignment } from "../lib/compliance/check"
import { loadRules } from "../lib/compliance/load"
import { loadMonthNetHoursBeforeWeek } from "../lib/compliance/hours"
import { getShiftStart, getShiftEnd } from "../lib/scheduling/shift-date"

const LOCATION = "Camondas"

// The phone that plays the employee calling in sick. Override with
// COVRLY_SICK_PHONE=… ; add COVRLY_COVER_PHONE=… for a second real handset so
// the cover request buzzes on someone else's phone (Meta allows 5 test
// recipients — two phones on the doc-cam is what makes this unarguable).
const SICK_PHONE = process.env.COVRLY_SICK_PHONE ?? "4915123865499"
const COVER_PHONE = process.env.COVRLY_COVER_PHONE ?? null

// Tim's phone is the one that DOESN'T ring. He's a Werkstudent at 17 h; the 5 h
// cover would put him at 22 h, over the 20 h lecture-time cap — so Covrly never
// contacts him. Three handsets on the table, one buzzes: the silent one is the
// compliance engine made physical, and you can name the law it enforced.
const BLOCKED_PHONE = process.env.COVRLY_BLOCKED_PHONE ?? null

// Monday of the current week (local), offset in weeks.
const monday = (offsetWeeks = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7)
  d.setHours(0, 0, 0, 0)
  return d
}

const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5

// Age 15 on the demo date — a 16-year-old would be LEGAL until 22:00 in
// gastronomy (nightEndGastro16Plus), and the Abendschicht ends exactly at
// 22:00, so only a 15-year-old is genuinely blocked by the night rule.
const birthdayForAge = (years: number) => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  d.setMonth(0, 15)
  d.setHours(0, 0, 0, 0)
  return d
}

async function main() {
  const owner = await prisma.user.findFirst({
    where: { locations: { some: { name: LOCATION } } },
    include: { locations: true },
  })
  if (!owner) throw new Error(`No owner found for location "${LOCATION}"`)
  const loc = owner.locations.find((l) => l.name === LOCATION)!
  console.log(`Staging ${LOCATION} (owner ${owner.email})\n`)

  // ── Reset the stage ────────────────────────────────────────────────────────
  await prisma.shift.deleteMany({ where: { schedule: { locationId: loc.id } } })
  await prisma.schedule.deleteMany({ where: { locationId: loc.id } })
  await prisma.chatMessage.deleteMany({ where: { locationId: loc.id } })
  await prisma.sickCall.deleteMany({ where: { locationId: loc.id } })
  await prisma.auditLog.deleteMany({ where: { locationId: loc.id } })
  await prisma.vacation.deleteMany({ where: { locationId: loc.id } })
  await prisma.blockedTime.deleteMany({ where: { locationId: loc.id } })
  await prisma.fixedShift.deleteMany({ where: { locationId: loc.id } })
  await prisma.managerRule.deleteMany({ where: { locationId: loc.id } })
  await prisma.employee.deleteMany({ where: { locationId: loc.id } })
  await prisma.shiftTemplate.deleteMany({ where: { locationId: loc.id } })

  await prisma.location.update({
    where: { id: loc.id },
    data: {
      timezone: "Europe/Berlin",
      escalationTimeoutHours: 1, // escalate fast — a demo can't wait hours
      checkInGraceMinutes: 15,
    },
  })

  // ── Shift templates ────────────────────────────────────────────────────────
  const frueh = await prisma.shiftTemplate.create({
    data: { locationId: loc.id, name: "Frühschicht", startTime: "07:00", endTime: "13:00", minHeadcount: 2, requiredRoles: ["Barista", "Service"] },
  })
  const mittag = await prisma.shiftTemplate.create({
    data: { locationId: loc.id, name: "Mittagsschicht", startTime: "12:00", endTime: "17:00", minHeadcount: 1, requiredRoles: ["Service"] },
  })
  const abend = await prisma.shiftTemplate.create({
    data: { locationId: loc.id, name: "Abendschicht", startTime: "17:00", endTime: "22:00", minHeadcount: 2, requiredRoles: ["Service", "Kitchen"] },
  })

  // ── The cast ───────────────────────────────────────────────────────────────
  // Only Marco carries an hourlyWage: checkStatusCaps runs BEFORE the age
  // rules, so a wage on Lina or Tim could make the Minijob cap fire instead of
  // the rule we actually want to show. One wage, one intended refusal each.
  const mk = (data: Parameters<typeof prisma.employee.create>[0]["data"]) =>
    prisma.employee.create({ data })

  const niko = await mk({
    locationId: loc.id, name: "Niko", email: "niko@camondas.demo", phone: SICK_PHONE,
    roles: ["Service", "Kitchen"], category: "MINIJOB_ZEITARBEIT", minHours: 0, maxHours: 40,
  })
  const vedika = await mk({
    locationId: loc.id, name: "Vedika", email: "vedika@camondas.demo", phone: COVER_PHONE,
    roles: ["Barista", "Service", "Kitchen"], category: "MINIJOB_ZEITARBEIT", minHours: 0, maxHours: 40,
  })
  const lina = await mk({
    locationId: loc.id, name: "Lina", email: "lina@camondas.demo",
    roles: ["Service"], category: "MINIJOB_ZEITARBEIT", minHours: 0, maxHours: 40,
    birthDate: birthdayForAge(15),
  })
  const tim = await mk({
    locationId: loc.id, name: "Tim", email: "tim@camondas.demo", phone: BLOCKED_PHONE,
    roles: ["Service", "Kitchen"], category: "MINIJOB_ZEITARBEIT", minHours: 0, maxHours: 40,
    isWerkstudent: true, lectureFree: false,
  })
  const marco = await mk({
    locationId: loc.id, name: "Marco", email: "marco@camondas.demo",
    roles: ["Barista", "Service"], category: "MINIJOB_ZEITARBEIT", minHours: 0, maxHours: 40,
    hourlyWageCents: 1500,
  })
  const julia = await mk({
    locationId: loc.id, name: "Julia", email: "julia@camondas.demo",
    roles: ["Service", "Kitchen", "Bar"], category: "TEILZEIT_FEST", minHours: 0, maxHours: 40,
  })

  // ── Recurring availability ────────────────────────────────────────────────
  // Ranking matches on dayOfWeek ONLY (template is ignored), so whoever has
  // Tuesday availability becomes a candidate for the Tuesday call-out. That set
  // is exactly the cast of the refusal scene — plus Vedika, who survives it.
  const avail: { emp: string; days: number[] }[] = [
    { emp: niko.id, days: [TUE, WED, THU, FRI] },
    { emp: vedika.id, days: [MON, TUE, WED, THU] },
    { emp: lina.id, days: [MON, TUE, WED, FRI] },
    { emp: tim.id, days: [MON, TUE, THU, FRI] },
    { emp: marco.id, days: [TUE, WED, THU, FRI] },
    // Julia is Festangestellt — freely assignable, and deliberately NOT
    // available Tuesday, so she never enters the candidate list.
    { emp: julia.id, days: [MON, WED, THU, FRI] },
  ]
  for (const a of avail)
    for (const d of a.days)
      for (const t of [frueh, mittag, abend])
        await prisma.recurringAvailability.create({
          data: { employeeId: a.emp, shiftTemplateId: t.id, dayOfWeek: d },
        })

  // ── The week grids ────────────────────────────────────────────────────────
  // Hand-built rather than generated, because the rest rules make this a real
  // puzzle: an Abendschicht ends at 22:00 and a Frühschicht starts at 07:00 —
  // only 9 h apart, under the 10 h ArbZG floor. Nobody works a morning after an
  // evening here. Vedika in particular must stay legal for the Tuesday cover.
  //
  // CRITICAL: Niko has exactly ONE upcoming shift — the Tuesday Abendschicht of
  // the demo week. The sick-call picker offers every future shift, so if he had
  // others he could tap the wrong one on stage and the whole refusal story
  // collapses (a different day means different people are legal). He appears in
  // LAST week for history, and not at all in the current week.
  type Row = { t: string; day: number; who: (string | null)[] }
  const F = frueh.id, M = mittag.id, A = abend.id

  const demoWeek: Row[] = [
    { t: F, day: MON, who: [julia.id, lina.id] },
    { t: M, day: MON, who: [marco.id] },
    { t: A, day: MON, who: [vedika.id, tim.id] },

    { t: F, day: TUE, who: [marco.id, null] }, // open seat → the "open shifts" story
    { t: M, day: TUE, who: [null] },
    { t: A, day: TUE, who: [niko.id, julia.id] }, // ← THE SICK SHIFT (Niko's seat)

    { t: F, day: WED, who: [lina.id, marco.id] },
    { t: M, day: WED, who: [null] },
    { t: A, day: WED, who: [vedika.id, julia.id] },

    { t: F, day: THU, who: [tim.id, lina.id] },
    { t: M, day: THU, who: [marco.id] },
    { t: A, day: THU, who: [vedika.id, julia.id] },

    { t: F, day: FRI, who: [tim.id, lina.id] },
    { t: M, day: FRI, who: [marco.id] },
    { t: A, day: FRI, who: [vedika.id, julia.id] },
  ]

  // Current week — deliberately WITHOUT Niko, so his only future shift stays the
  // demo one. Gives the dashboard something to show.
  const thisWeekRows: Row[] = [
    { t: F, day: MON, who: [julia.id, lina.id] },
    { t: F, day: WED, who: [tim.id, lina.id] },
    { t: A, day: WED, who: [vedika.id, julia.id] },
    { t: M, day: FRI, who: [marco.id] },
    { t: A, day: FRI, who: [vedika.id, julia.id] },
  ]

  // Last week — fully in the past, so it never pollutes the sick-call picker.
  // Marco's hours here + this week are calibrated so he sits just UNDER the
  // Minijob cap (amber warning) and a 5 h cover would tip him over it. That's
  // what makes his refusal real rather than staged.
  const lastWeekRows: Row[] = [
    { t: A, day: MON, who: [niko.id, vedika.id] },
    { t: M, day: WED, who: [marco.id] },
    { t: A, day: WED, who: [niko.id, julia.id] },
    { t: A, day: FRI, who: [niko.id, vedika.id] },
  ]

  const buildWeek = async (weekStart: Date, rows: Row[]) => {
    const sched = await prisma.schedule.create({
      data: { locationId: loc.id, weekStart, status: "PUBLISHED" },
    })
    for (const r of rows)
      for (const employeeId of r.who)
        await prisma.shift.create({
          data: {
            scheduleId: sched.id,
            shiftTemplateId: r.t,
            dayOfWeek: r.day,
            employeeId,
            status: employeeId ? "ACCEPTED" : "UNASSIGNED",
          },
        })
    return sched
  }

  const lastWeek = monday(-1)
  const thisWeek = monday(0)
  const nextWeek = monday(1)
  await buildWeek(lastWeek, lastWeekRows)
  await buildWeek(thisWeek, thisWeekRows)
  const demo = await buildWeek(nextWeek, demoWeek)

  // Nobody gets auto-dropped for an unconfirmed availability ask.
  for (const e of [niko, vedika, lina, tim, marco, julia])
    for (const w of [lastWeek, thisWeek, nextWeek])
      await prisma.availabilityConfirmation.create({ data: { employeeId: e.id, weekStart: w } })

  // ── Verify the stage against the REAL compliance engine ───────────────────
  // Runs exactly the check the replacement engine runs. If this doesn't print
  // three refusals and one ask, the demo is broken — find out now, not on stage.
  const sickShift = await prisma.shift.findFirst({
    where: { scheduleId: demo.id, shiftTemplateId: abend.id, dayOfWeek: TUE, employeeId: niko.id },
    include: { shiftTemplate: true },
  })
  if (!sickShift) throw new Error("sick shift not found — grid is wrong")

  const rules = await loadRules(nextWeek)
  const slot = {
    start: getShiftStart(nextWeek, TUE, sickShift.shiftTemplate.startTime),
    end: getShiftEnd(nextWeek, TUE, sickShift.shiftTemplate.endTime),
  }
  const cast = [lina, tim, marco, vedika]
  const monthHours = await loadMonthNetHoursBeforeWeek(cast.map((e) => e.id), nextWeek, rules.arbzg)

  // The sick-call picker offers EVERY future shift. If Niko has more than one,
  // he can tap the wrong one on stage — a different day means different people
  // are legal, and the three-refusals story silently becomes a different story.
  const nikoShifts = await prisma.shift.findMany({
    where: { employeeId: niko.id, status: { in: ["PENDING", "ACCEPTED"] } },
    include: { shiftTemplate: true, schedule: { select: { weekStart: true } } },
  })
  const now = new Date()
  const nikoFuture = nikoShifts.filter(
    (s) => getShiftStart(new Date(s.schedule.weekStart), s.dayOfWeek, s.shiftTemplate.startTime) > now
  )

  console.log(`Sick shift: ${sickShift.shiftTemplate.name} ${slot.start.toDateString()} ${sickShift.shiftTemplate.startTime}–${sickShift.shiftTemplate.endTime}`)
  console.log(`Niko calls in sick from ${SICK_PHONE}`)
  if (nikoFuture.length === 1) {
    console.log(`Niko has exactly 1 upcoming shift — he cannot tap the wrong one.\n`)
  } else {
    console.log(`\n⚠️  Niko has ${nikoFuture.length} upcoming shifts — he can tap the WRONG one on stage:`)
    for (const s of nikoFuture)
      console.log(`      ${getShiftStart(new Date(s.schedule.weekStart), s.dayOfWeek, s.shiftTemplate.startTime).toDateString()} ${s.shiftTemplate.name}`)
    console.log()
  }
  console.log("Who can legally cover?")

  let asked = 0
  for (const e of cast) {
    const others = await prisma.shift.findMany({
      where: { scheduleId: demo.id, employeeId: e.id, id: { not: sickShift.id }, status: { notIn: ["DECLINED", "UNASSIGNED"] } },
      include: { shiftTemplate: true },
    })
    const existing = others.map((s) => ({
      start: getShiftStart(nextWeek, s.dayOfWeek, s.shiftTemplate.startTime),
      end: getShiftEnd(nextWeek, s.dayOfWeek, s.shiftTemplate.endTime),
    }))
    const v = checkEmployeeAssignment(e, slot, existing, rules, {
      monthNetHoursBeforeWeek: monthHours[e.id] ?? 0,
    })
    if (v) {
      const silent = e.phone ? `  📵 ${e.phone} stays SILENT` : ""
      console.log(`   ✗ ${e.name.padEnd(7)} BLOCKED  ${v.rule} — ${v.detail}${silent}`)
    } else {
      asked++
      console.log(`   ✓ ${e.name.padEnd(7)} legal → Covrly asks ${e.name}${e.phone ? `  📱 ${e.phone} RINGS` : " (no phone — in-app thread only)"}`)
    }
  }

  console.log()
  if (asked === 1) console.log("Stage is correct: three refusals, one ask.")
  else console.log(`⚠️  Expected exactly 1 legal coverer, got ${asked}. The demo will not tell the story you want.`)
  if (!COVER_PHONE) console.log("💡 Set COVRLY_COVER_PHONE=… to make the cover request land on a second real handset.")
  if (!BLOCKED_PHONE) console.log("💡 Set COVRLY_BLOCKED_PHONE=… to give Tim a handset that visibly stays silent.")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

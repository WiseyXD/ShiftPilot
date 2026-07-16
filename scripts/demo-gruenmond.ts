// Demo-day seed for Grünmond (aryan.s.nag@gmail.com). Re-runnable: wipes the
// café's child data and rebuilds the exact stage the pitch needs.
//
//   bun scripts/demo-gruenmond.ts
//
// The story it stages: Niko calls in sick from a REAL phone for next Tuesday's
// Evening Shift (17:00–22:00). Covrly looks for cover and refuses three people
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

const LOCATION = "Grünmond"

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

// Shift.dayOfWeek matches JS getDay(): Sunday is 0, not 7.
const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6, SUN = 0
const ALL_DAYS = [MON, TUE, WED, THU, FRI, SAT, SUN]

// Age 15 on the demo date — a 16-year-old would be LEGAL until 22:00 in
// gastronomy (nightEndGastro16Plus), and the Evening Shift ends exactly at
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
  const morning = await prisma.shiftTemplate.create({
    data: { locationId: loc.id, name: "Morning Shift", startTime: "07:00", endTime: "13:00", minHeadcount: 2, requiredRoles: ["Barista", "Service"] },
  })
  const midday = await prisma.shiftTemplate.create({
    data: { locationId: loc.id, name: "Midday Shift", startTime: "12:00", endTime: "17:00", minHeadcount: 1, requiredRoles: ["Service"] },
  })
  const evening = await prisma.shiftTemplate.create({
    data: { locationId: loc.id, name: "Evening Shift", startTime: "17:00", endTime: "22:00", minHeadcount: 2, requiredRoles: ["Service", "Kitchen"] },
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
  // TOUCH TUESDAY AT YOUR PERIL: adding it to Julia gives the engine a fifth
  // candidate and the "three refusals, one ask" story quietly becomes four.
  const avail: { emp: string; days: number[] }[] = [
    { emp: niko.id, days: [TUE, WED, THU, FRI, SAT, SUN] },
    { emp: vedika.id, days: ALL_DAYS },
    // Lina is 15: JArbSchG caps her at a 5-day week and bars Sundays outright,
    // so weekends never go in her availability in the first place.
    { emp: lina.id, days: [MON, TUE, WED, THU, FRI] },
    { emp: tim.id, days: [MON, TUE, WED, THU, FRI, SAT] },
    { emp: marco.id, days: [TUE, WED, THU, FRI, SAT, SUN] },
    // Julia is Festangestellt — freely assignable, and deliberately NOT
    // available Tuesday, so she never enters the candidate list. She still
    // WORKS Tuesdays in the grid below; availability and assignment are
    // different things, and only availability feeds the ranking.
    { emp: julia.id, days: [MON, WED, THU, FRI, SAT, SUN] },
  ]
  for (const a of avail)
    for (const d of a.days)
      for (const t of [morning, midday, evening])
        await prisma.recurringAvailability.create({
          data: { employeeId: a.emp, shiftTemplateId: t.id, dayOfWeek: d },
        })

  // ── The week grids ────────────────────────────────────────────────────────
  // Every day of all three weeks carries all three shifts. Seats that no one
  // can LEGALLY take are left `null` (→ UNASSIGNED, an "Open" chip) rather than
  // filled with someone the compliance engine would flag — an open seat is
  // honest, a quietly illegal roster is not.
  //
  // Hand-built rather than generated, because the caps make this a real puzzle:
  //
  //   • ONE SHIFT PER PERSON PER DAY. Daily max is 8 h net and every pair
  //     overlaps or busts it (Morning 6 h + Midday 5 h = 11 h), so 5 seats/day
  //     means 5 different people.
  //   • NO EVENING → NEXT MORNING, for anyone. 22:00 to 07:00 is 9 h rest,
  //     under the 10 h ArbZG floor. This is why mornings are the thin ones:
  //     Vedika works evenings, so she can never open the next day.
  //   • MARCO'S WHOLE JULY is pinned to 35.2–40.2 h. Below 35.2 the 5 h cover
  //     doesn't tip him over 603 €; above 40.2 he's ALREADY over and the board
  //     is showing a violation before the demo starts. 37 h it is — which is
  //     also just what a minijobber's month looks like: ~2 shifts a week.
  //   • TIM'S DEMO WEEK must land in 15–20 h. 20 h exactly is legal (the rule
  //     is `> 20`), and +5 h makes 25 h — a refusal the engine computes.
  //
  // CRITICAL: Niko has exactly ONE upcoming shift — the Tuesday Evening Shift of
  // the demo week. The sick-call picker offers every future shift, so if he had
  // others he could tap the wrong one on stage and the whole refusal story
  // collapses (a different day means different people are legal). He appears in
  // LAST week for history, and not at all in the current week — "not at all" is
  // deliberate: seeding him into a past day of THIS week would depend on what
  // time you re-run this, and a re-run on a Monday would hand him a live shift.
  type Who = string | null
  type Row = { t: string; day: number; who: Who[] }
  const AM = morning.id, MID = midday.id, PM = evening.id

  // One line per day: morning (2 seats), midday (1), evening (2).
  const day = (d: number, am: [Who, Who], mid: [Who], pm: [Who, Who]): Row[] => [
    { t: AM, day: d, who: am },
    { t: MID, day: d, who: mid },
    { t: PM, day: d, who: pm },
  ]

  // Demo week. Vedika takes the evenings and is OFF Tuesday entirely — any
  // Tuesday shift at all would put her over the 8 h day once the 5 h cover
  // lands, and a Wednesday morning would leave her 9 h rest after it. She is
  // the only person who may legally cover; both are load-bearing.
  const demoWeek: Row[] = [
    //         morning                    midday        evening
    ...day(MON, [lina.id, marco.id], [julia.id], [vedika.id, null]),
    ...day(TUE, [lina.id, marco.id], [tim.id], [niko.id, julia.id]), // ← Niko's seat = THE SICK SHIFT
    ...day(WED, [lina.id, null], [julia.id], [vedika.id, null]),
    ...day(THU, [lina.id, julia.id], [marco.id], [vedika.id, null]),
    ...day(FRI, [lina.id, julia.id], [tim.id], [vedika.id, null]),
    ...day(SAT, [julia.id, null], [tim.id], [vedika.id, null]),
    ...day(SUN, [julia.id, null], [tim.id], [vedika.id, null]),
  ]

  // Current week — deliberately WITHOUT Niko (see above). Marco takes 10 h here
  // and 10 h last week, leaving 17 h for the demo week: 37 h for July.
  const thisWeekRows: Row[] = [
    ...day(MON, [lina.id, julia.id], [marco.id], [vedika.id, null]),
    ...day(TUE, [lina.id, julia.id], [marco.id], [vedika.id, null]),
    ...day(WED, [lina.id, julia.id], [tim.id], [vedika.id, null]),
    ...day(THU, [lina.id, julia.id], [tim.id], [vedika.id, null]),
    ...day(FRI, [lina.id, julia.id], [tim.id], [vedika.id, null]),
    ...day(SAT, [julia.id, null], [tim.id], [vedika.id, null]),
    ...day(SUN, [null, null], [julia.id], [vedika.id, null]),
  ]

  // Last week — fully in the past, so it never pollutes the sick-call picker,
  // and Niko can work every evening without touching his one-future-shift rule.
  const lastWeekRows: Row[] = [
    ...day(MON, [lina.id, julia.id], [marco.id], [vedika.id, niko.id]),
    ...day(TUE, [lina.id, julia.id], [marco.id], [vedika.id, niko.id]),
    ...day(WED, [lina.id, julia.id], [tim.id], [vedika.id, niko.id]),
    ...day(THU, [lina.id, julia.id], [tim.id], [vedika.id, niko.id]),
    ...day(FRI, [lina.id, julia.id], [tim.id], [vedika.id, niko.id]),
    ...day(SAT, [julia.id, null], [tim.id], [vedika.id, niko.id]),
    ...day(SUN, [null, null], [julia.id], [vedika.id, niko.id]),
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
  const past = await buildWeek(lastWeek, lastWeekRows)
  const current = await buildWeek(thisWeek, thisWeekRows)
  const demo = await buildWeek(nextWeek, demoWeek)

  // Nobody gets auto-dropped for an unconfirmed availability ask.
  for (const e of [niko, vedika, lina, tim, marco, julia])
    for (const w of [lastWeek, thisWeek, nextWeek])
      await prisma.availabilityConfirmation.create({ data: { employeeId: e.id, weekStart: w } })

  // ── Verify the stage against the REAL compliance engine ───────────────────
  // Runs exactly the check the replacement engine runs. If this doesn't print
  // three refusals and one ask, the demo is broken — find out now, not on stage.
  const sickShift = await prisma.shift.findFirst({
    where: { scheduleId: demo.id, shiftTemplateId: evening.id, dayOfWeek: TUE, employeeId: niko.id },
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

  // ── Is the ROSTER ITSELF legal? ───────────────────────────────────────────
  // Filling every day is only worth anything if nobody is scheduled into a
  // violation. Re-check each assigned shift against the same engine, with that
  // person's OTHER shifts that week as context — if the board would show a
  // breach before Niko even calls, we want to know here.
  const everyone = [niko, vedika, lina, tim, marco, julia]
  const weeks = [
    { name: "last week", start: lastWeek, id: past.id },
    { name: "this week", start: thisWeek, id: current.id },
    { name: "demo week", start: nextWeek, id: demo.id },
  ]
  let rosterBreaches = 0
  let seats = 0
  let openSeats = 0

  for (const w of weeks) {
    const shifts = await prisma.shift.findMany({
      where: { scheduleId: w.id },
      include: { shiftTemplate: true },
    })
    seats += shifts.length
    openSeats += shifts.filter((s) => !s.employeeId).length

    const monthBefore = await loadMonthNetHoursBeforeWeek(
      everyone.map((e) => e.id),
      w.start,
      rules.arbzg
    )
    const planned = (s: (typeof shifts)[number]) => ({
      start: getShiftStart(w.start, s.dayOfWeek, s.shiftTemplate.startTime),
      end: getShiftEnd(w.start, s.dayOfWeek, s.shiftTemplate.endTime),
    })

    for (const emp of everyone) {
      const mine = shifts.filter((s) => s.employeeId === emp.id)
      for (const s of mine) {
        const others = mine.filter((o) => o.id !== s.id).map(planned)
        const v = checkEmployeeAssignment(emp, planned(s), others, rules, {
          monthNetHoursBeforeWeek: monthBefore[emp.id] ?? 0,
        })
        if (v) {
          rosterBreaches++
          console.log(
            `   ⚠️  ${w.name}: ${emp.name} on ${s.shiftTemplate.name} day ${s.dayOfWeek} — ${v.rule}: ${v.detail}`
          )
        }
      }
    }
  }

  const filled = seats - openSeats
  console.log(
    `Roster: ${filled}/${seats} seats filled across 3 weeks, ${openSeats} left open — ${
      rosterBreaches === 0 ? "no compliance breaches ✓" : `${rosterBreaches} BREACHES ✗`
    }\n`
  )

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

// Manager pins (FixedShift) + Sperrzeiten (BlockedTime). Pure helpers — the
// generator seeds pins at priority 2 (only legal limits override) and treats
// blocks as hard exclusions.

export interface Pin {
  employeeId: string
  shiftTemplateId: string
  dayOfWeek: number
  weekStart: Date | string | null // null = every week
}

export interface Block {
  employeeId: string
  shiftTemplateId: string | null // null = the whole day
  dayOfWeek: number
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function pinsForWeek(pins: Pin[], weekStart: Date): Pin[] {
  return pins.filter(
    (p) => p.weekStart === null || sameDay(new Date(p.weekStart), weekStart)
  )
}

export function isBlocked(
  blocks: Block[],
  employeeId: string,
  shiftTemplateId: string,
  dayOfWeek: number
): boolean {
  return blocks.some(
    (b) =>
      b.employeeId === employeeId &&
      b.dayOfWeek === dayOfWeek &&
      (b.shiftTemplateId === null || b.shiftTemplateId === shiftTemplateId)
  )
}

export const slotKey = (shiftTemplateId: string, dayOfWeek: number) =>
  `${shiftTemplateId}:${dayOfWeek}`

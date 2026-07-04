// Vacation exclusion. Pure — ranges are calendar days, inclusive on both ends,
// compared on local date (a Friday-evening shift during a Friday-ending
// vacation is still covered).

export interface VacationRange {
  employeeId: string
  startDate: Date | string
  endDate: Date | string
}

const dayFloor = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
// Range boundaries are stored as UTC-midnight dates; read them as calendar days.
const utcDayFloor = (d: Date | string) => {
  const x = new Date(d)
  return new Date(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()).getTime()
}

export function isOnVacation(
  vacations: VacationRange[],
  employeeId: string,
  date: Date
): boolean {
  const day = dayFloor(date)
  return vacations.some(
    (v) =>
      v.employeeId === employeeId && day >= utcDayFloor(v.startDate) && day <= utcDayFloor(v.endDate)
  )
}

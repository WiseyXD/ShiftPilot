export interface FreezeConfig {
  freezeWindowHours: number
}

export function isInFreezeWindow(
  shiftStartTime: Date,
  config: FreezeConfig,
  now: Date = new Date()
): boolean {
  const freezeStart = new Date(shiftStartTime.getTime() - config.freezeWindowHours * 60 * 60 * 1000)
  return now > freezeStart
}

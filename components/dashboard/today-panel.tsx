import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MapPin, TriangleAlert } from "lucide-react"
import type { WeatherToday } from "@/lib/weather/client"
import type { NearbyEvent } from "@/lib/events/client"
import type { TrafficEstimate } from "@/lib/events/traffic"
import { ui, uiDateLocale, type UiLang } from "@/lib/i18n/dashboard"

// Read-only scale: the level is inferred from the nearby-event count by
// estimateTraffic(), so these are segments that light up, not tabs you pick.
// Ordered low → high; the engine's names for those levels are normal/elevated/high.
const BUSY_LEVELS: TrafficEstimate["level"][] = ["normal", "elevated", "high"]

const BUSY_ACTIVE_STYLES: Record<TrafficEstimate["level"], string> = {
  normal: "bg-slate-200 text-slate-700",
  elevated: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-700",
}

export function TodayPanel({
  hasLocationCoords,
  addressSettingsHref,
  weather,
  events,
  traffic,
  lang = "en",
}: {
  hasLocationCoords: boolean
  addressSettingsHref: string
  weather: WeatherToday | null
  events: NearbyEvent[]
  traffic: TrafficEstimate
  lang?: UiLang
}) {
  const t = ui(lang).today
  const today = new Date().toLocaleDateString(uiDateLocale(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t.title(today)}</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasLocationCoords ? (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
            <MapPin className="h-4 w-4 shrink-0" />
            <span>
              {t.addAddress}
              <Link href={addressSettingsHref} className="text-primary hover:underline">
                {t.setItHere}
              </Link>
              .
            </span>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Weather, with the footfall scale reading directly beneath it */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-100 px-4 py-4">
                {weather ? (
                  <div className="flex items-center gap-3">
                    <span className="text-3xl leading-none">{weather.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {weather.tempC}°C · {weather.conditionLabel}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t.feelsLike(weather.feelsLikeC)} · H {weather.maxC}° / L {weather.minC}° ·{" "}
                        {t.rain(weather.precipitationChance)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t.weatherUnavailable}</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-100 px-4 py-4">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-slate-500">{t.busyTitle}</p>
                  {traffic.level !== "normal" && (
                    <TriangleAlert className="h-3.5 w-3.5 text-amber-600" />
                  )}
                </div>
                <div
                  role="group"
                  aria-label={t.busyTitle}
                  className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-50 p-1"
                >
                  {BUSY_LEVELS.map((level) => {
                    const active = level === traffic.level
                    return (
                      <span
                        key={level}
                        aria-current={active}
                        className={`rounded-lg px-2 py-1.5 text-center text-xs font-medium transition-colors ${
                          active ? BUSY_ACTIVE_STYLES[level] : "text-slate-400"
                        }`}
                      >
                        {level === "normal" ? t.busyLow : level === "elevated" ? t.busyMedium : t.busyHigh}
                      </span>
                    )
                  })}
                </div>
                <p className="text-xs text-slate-500 mt-2">{traffic.label}</p>
              </div>
            </div>

            {/* Nearby events */}
            <div className="rounded-2xl border border-slate-100 px-4 py-4">
              <p className="text-xs font-medium text-slate-500">{t.eventsTitle}</p>
              {events.length === 0 ? (
                <p className="text-sm text-slate-500 mt-2">{t.noEvents}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {events.slice(0, 3).map((e) => (
                    <li key={e.id} className="min-w-0">
                      <p className="text-sm text-slate-700 truncate">{e.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {e.venueName ?? ""}
                        {e.venueName && e.localTime ? " · " : ""}
                        {e.localTime ? e.localTime.slice(0, 5) : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

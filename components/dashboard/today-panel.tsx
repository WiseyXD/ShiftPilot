import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CalendarClock, MapPin, TriangleAlert } from "lucide-react"
import type { WeatherToday } from "@/lib/weather/client"
import type { NearbyEvent } from "@/lib/events/client"
import type { TrafficEstimate } from "@/lib/events/traffic"
import { ui, uiDateLocale, type UiLang } from "@/lib/i18n/dashboard"

export interface TodayShift {
  id: string
  employeeName: string
  templateName: string
  start: Date
  end: Date
  status: string
}

const TRAFFIC_STYLES: Record<TrafficEstimate["level"], string> = {
  normal: "bg-slate-100 text-slate-600 border-slate-200",
  elevated: "bg-yellow-100 text-yellow-700 border-yellow-200",
  high: "bg-red-100 text-red-700 border-red-200",
}

const SHIFT_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600 border-slate-200",
  ACCEPTED: "bg-green-100 text-green-700 border-green-200",
  DECLINED: "bg-red-100 text-red-700 border-red-200",
  REASSIGNED: "bg-blue-100 text-blue-700 border-blue-200",
  UNASSIGNED: "bg-yellow-100 text-yellow-700 border-yellow-200",
  LENT_OUT: "bg-purple-100 text-purple-700 border-purple-200",
  NO_SHOW: "bg-red-100 text-red-700 border-red-200",
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

export function TodayPanel({
  hasLocationCoords,
  addressSettingsHref,
  weather,
  events,
  traffic,
  todayShifts,
  lang = "en",
}: {
  hasLocationCoords: boolean
  addressSettingsHref: string
  weather: WeatherToday | null
  events: NearbyEvent[]
  traffic: TrafficEstimate
  todayShifts: TodayShift[]
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
            {/* Weather */}
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

            {/* Traffic / nearby events */}
            <div className="rounded-2xl border border-slate-100 px-4 py-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${TRAFFIC_STYLES[traffic.level]}`}>
                  {traffic.level === "normal" ? t.normalTraffic : traffic.level === "elevated" ? t.elevatedTraffic : t.highTraffic}
                </Badge>
                {traffic.level !== "normal" && <TriangleAlert className="h-3.5 w-3.5 text-amber-600" />}
              </div>
              <p className="text-sm text-slate-600 mt-2">{traffic.label}</p>
              {events.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {events.slice(0, 3).map((e) => (
                    <li key={e.id} className="text-xs text-slate-500 truncate">
                      {e.name}
                      {e.venueName ? ` — ${e.venueName}` : ""}
                      {e.localTime ? ` (${e.localTime.slice(0, 5)})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Today's schedule */}
        <div className="mt-4">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-900 mb-2">
            <CalendarClock className="h-4 w-4 text-slate-400" />
            {t.todaysShifts}
          </div>
          {todayShifts.length === 0 ? (
            <p className="text-sm text-slate-500 px-1">{t.noShiftsToday}</p>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
              {todayShifts.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{s.employeeName}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {s.templateName} · {formatTime(s.start)}–{formatTime(s.end)}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-xs shrink-0 ${SHIFT_STATUS_STYLES[s.status] ?? ""}`}>
                    {s.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

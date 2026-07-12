// Current weather + today's forecast via Open-Meteo. Free, no key — same
// keyless-fetch pattern as lib/marketplace/geocode.ts.

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

export interface WeatherToday {
  tempC: number
  feelsLikeC: number
  maxC: number
  minC: number
  precipitationChance: number
  conditionLabel: string
  icon: string
}

// WMO weather codes → (label, emoji), collapsed to the ranges Open-Meteo emits.
function describeConditionCode(code: number): { label: string; icon: string } {
  if (code === 0) return { label: "Clear sky", icon: "☀️" }
  if (code <= 2) return { label: "Partly cloudy", icon: "🌤️" }
  if (code === 3) return { label: "Overcast", icon: "☁️" }
  if (code <= 48) return { label: "Foggy", icon: "🌫️" }
  if (code <= 57) return { label: "Drizzle", icon: "🌦️" }
  if (code <= 67) return { label: "Rain", icon: "🌧️" }
  if (code <= 77) return { label: "Snow", icon: "❄️" }
  if (code <= 82) return { label: "Rain showers", icon: "🌧️" }
  if (code <= 86) return { label: "Snow showers", icon: "🌨️" }
  if (code <= 99) return { label: "Thunderstorm", icon: "⛈️" }
  return { label: "Unknown", icon: "🌡️" }
}

export async function getWeatherToday(lat: number, lng: number): Promise<WeatherToday | null> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "temperature_2m,apparent_temperature,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    forecast_days: "1",
    timezone: "auto",
  })

  try {
    const res = await fetch(`${FORECAST_URL}?${params.toString()}`)
    if (!res.ok) return null

    const data = await res.json()
    const current = data.current
    const daily = data.daily
    if (!current || !daily) return null

    const { label, icon } = describeConditionCode(current.weather_code)

    return {
      tempC: Math.round(current.temperature_2m),
      feelsLikeC: Math.round(current.apparent_temperature),
      maxC: Math.round(daily.temperature_2m_max[0]),
      minC: Math.round(daily.temperature_2m_min[0]),
      precipitationChance: daily.precipitation_probability_max[0] ?? 0,
      conditionLabel: label,
      icon,
    }
  } catch {
    return null
  }
}

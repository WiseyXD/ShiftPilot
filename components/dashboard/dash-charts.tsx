"use client"

// Dashboard charts. Coverage is real data from the shown week; the response
// trend is SAMPLE DATA until response timestamps are tracked (#43 follow-up).
// Colors: chart-1 terracotta + neutral remainder for the stacked coverage bar;
// chart-2 olive for the single-series trend line (validated palette).

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ui, type UiLang } from "@/lib/i18n/dashboard"

export interface CoveragePoint {
  day: string
  filled: number
  open: number
}

export interface ResponsePoint {
  week: string
  hours: number
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean
  payload?: { name: string; value: number; color?: string }[]
  label?: string
  unit?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-medium text-foreground">{p.value}{unit ?? ""}</span>
        </p>
      ))}
    </div>
  )
}

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" }

export function CoverageChart({ lang, data }: { lang: UiLang; data: CoveragePoint[] }) {
  const d = ui(lang).dash
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{d.chartCoverage}</CardTitle>
        <CardDescription className="text-xs">{d.chartCoverageSub}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent)", opacity: 0.4 }} />
            {/* 2px card-colored stroke = the spacer between stacked segments */}
            <Bar
              dataKey="filled"
              name={d.filled}
              stackId="w"
              fill="var(--chart-1)"
              stroke="var(--card)"
              strokeWidth={2}
            />
            <Bar
              dataKey="open"
              name={d.openChip}
              stackId="w"
              fill="var(--muted)"
              stroke="var(--card)"
              strokeWidth={2}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--chart-1)" }} />
            {d.filled}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-border" style={{ backgroundColor: "var(--muted)" }} />
            {d.openChip}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export function ResponseChart({ lang, data }: { lang: UiLang; data: ResponsePoint[] }) {
  const d = ui(lang).dash
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{d.chartResponse}</CardTitle>
        <CardDescription className="text-xs">{d.chartResponseSub}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 6, right: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="week" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={28}
              unit="h"
              domain={[0, "auto"]}
            />
            <Tooltip content={<ChartTooltip unit="h" />} cursor={{ stroke: "var(--border)" }} />
            <Line
              type="monotone"
              dataKey="hours"
              name={d.chartResponse}
              stroke="var(--chart-2)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

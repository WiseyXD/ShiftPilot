// Four hero numbers — the owner's pulse check. Stat tiles, not charts: each
// carries one value, one label, one quiet context line.

import { Card, CardContent } from "@/components/ui/card"
import type { LucideIcon } from "lucide-react"

export interface KpiTile {
  label: string
  value: string
  sub: string
  icon: LucideIcon
  tone?: "default" | "warn"
}

export function KpiTiles({ tiles }: { tiles: KpiTile[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map(({ label, value, sub, icon: Icon, tone }) => (
        <Card key={label} className={tone === "warn" ? "border-yellow-300/70" : ""}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <Icon className={`h-4 w-4 ${tone === "warn" ? "text-yellow-600" : "text-muted-foreground/60"}`} />
            </div>
            <p className="mt-1.5 font-display text-3xl font-semibold leading-none text-foreground">
              {value}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

"use client"

import { usePathname } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { ui, type UiLang } from "@/lib/i18n/dashboard"

export function TopBar({ lang = "en" }: { lang?: UiLang }) {
  const pathname = usePathname()
  const parts = pathname.split("/").filter(Boolean)
  const tb = ui(lang).topbar

  const routeLabels: Record<string, string> = {
    schedules: tb.schedules,
    employees: tb.employees,
    templates: tb.templates,
    "audit-log": tb.auditLog,
    analytics: tb.analytics,
    billing: tb.billing,
    demo: tb.demo,
    new: tb.new,
    locations: tb.locations,
  }

  const crumbs: string[] = [tb.dashboard]
  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i]
    if (routeLabels[segment]) crumbs.push(routeLabels[segment])
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 backdrop-blur px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <nav className="flex items-center gap-2 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-slate-300">/</span>}
            <span className={i === crumbs.length - 1 ? "font-medium text-slate-900" : "text-slate-500"}>
              {crumb}
            </span>
          </span>
        ))}
      </nav>
    </header>
  )
}

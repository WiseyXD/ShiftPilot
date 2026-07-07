"use client"

import { usePathname } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"

const ROUTE_LABELS: Record<string, string> = {
  schedules: "Schedules",
  employees: "Employees",
  templates: "Templates",
  "audit-log": "Audit log",
  analytics: "Analytics",
  billing: "Billing",
  demo: "Demo setup",
  new: "New",
  locations: "Locations",
}

export function TopBar() {
  const pathname = usePathname()
  const parts = pathname.split("/").filter(Boolean)

  const crumbs: string[] = ["Dashboard"]
  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i]
    if (ROUTE_LABELS[segment]) crumbs.push(ROUTE_LABELS[segment])
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

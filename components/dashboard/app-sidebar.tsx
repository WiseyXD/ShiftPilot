"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  Calendar,
  Users,
  ClipboardList,
  Activity,
  BarChart3,
  CreditCard,
  Plus,
  Sparkles,
  Building2,
  MessageCircle,
  Bot,
  LogOut,
  Languages,
  Check,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Covrly } from "@/components/covrly"
import { Badge } from "@/components/ui/badge"
import { logOut } from "@/app/actions/auth"
import { setLanguage } from "@/app/actions/user"
import { useRouter } from "next/navigation"
import { ui, type UiLang } from "@/lib/i18n/dashboard"

interface Props {
  locations: { id: string; name: string }[]
  user: { email: string; plan: string; language: string }
}

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
]

export function AppSidebar({ locations, user }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const s = ui(user.language as UiLang).sidebar

  const pickLanguage = async (code: string) => {
    await setLanguage(code)
    router.refresh()
  }
  const locationMatch = pathname.match(/^\/dashboard\/([^/]+)/)
  const activeLocationId =
    locationMatch &&
    locationMatch[1] !== "demo" &&
    locationMatch[1] !== "locations" &&
    locationMatch[1] !== "billing" &&
    locationMatch[1] !== "marketplace"
      ? locationMatch[1]
      : null
  const activeLocation = locations.find((l) => l.id === activeLocationId)

  // The week board on the overview replaced the separate Schedules tab —
  // schedule detail/editor routes stay reachable from the board.
  const locationNav = activeLocationId
    ? [
        { label: s.overview, icon: Home, href: `/dashboard/${activeLocationId}` },
        { label: s.assistant, icon: Bot, href: `/dashboard/${activeLocationId}/assistant` },
        { label: s.employees, icon: Users, href: `/dashboard/${activeLocationId}/employees` },
        { label: s.whatsapp, icon: MessageCircle, href: `/dashboard/${activeLocationId}/whatsapp` },
      ]
    : []

  const isActive = (href: string) => {
    if (href === pathname) return true
    // Sub-route match (e.g. /schedules/abc is under /schedules), but not the overview link
    if (pathname.startsWith(href + "/") && href !== `/dashboard/${activeLocationId}`) return true
    return false
  }

  const initials = user.email.slice(0, 2).toUpperCase()
  const planLabel = user.plan === "TRIAL" ? "Trial" : user.plan === "STARTER" ? "Starter" : user.plan === "PRO" ? "Pro" : user.plan

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Covrly size={32} className="shrink-0" />
          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-display text-lg font-semibold tracking-tight text-sidebar-foreground">Covrly</span>
            <span className="text-xs text-sidebar-foreground/60 truncate">{s.tagline}</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Locations */}
        <SidebarGroup>
          <SidebarGroupLabel>{s.locations}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {locations.map((loc) => (
                <SidebarMenuItem key={loc.id}>
                  <SidebarMenuButton asChild isActive={loc.id === activeLocationId} tooltip={loc.name}>
                    <Link href={`/dashboard/${loc.id}`}>
                      <Building2 />
                      <span>{loc.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={s.addLocation}>
                  <Link href="/dashboard/locations/new" className="text-sidebar-foreground/70">
                    <Plus />
                    <span>{s.addLocation}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {locations.length === 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Try the demo">
                    <Link href="/dashboard/demo" className="text-sidebar-foreground/80">
                      <Sparkles />
                      <span>Try demo</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Per-location nav */}
        {activeLocation && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel className="truncate">{activeLocation.name}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {locationNav.map(({ label, icon: Icon, href }) => (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton asChild isActive={isActive(href)} tooltip={label}>
                        <Link href={href}>
                          <Icon />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="h-8 w-8 rounded-md">
                    <AvatarFallback className="rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium text-sidebar-foreground">{user.email}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{planLabel}</Badge>
                    </div>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56 rounded-lg"
                side="right"
                align="end"
                sideOffset={8}
              >
                <DropdownMenuLabel>
                  <p className="text-xs text-slate-500 font-normal">{s.signedInAs}</p>
                  <p className="text-sm font-medium truncate">{user.email}</p>
                </DropdownMenuLabel>
                {activeLocationId && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/${activeLocationId}/templates`}>
                        <ClipboardList />
                        {s.templates}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/${activeLocationId}/audit-log`}>
                        <Activity />
                        {s.auditLog}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/${activeLocationId}/analytics`}>
                        <BarChart3 />
                        {s.analytics}
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/billing">
                    <CreditCard />
                    {s.billing}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-2 text-xs text-slate-500 font-normal">
                  <Languages className="h-3.5 w-3.5" />
                  {s.language}
                </DropdownMenuLabel>
                {LANGUAGES.map(({ code, label }) => (
                  <DropdownMenuItem key={code} onClick={() => pickLanguage(code)}>
                    <span className="flex w-4 justify-center">
                      {user.language === code && <Check className="h-4 w-4" />}
                    </span>
                    {label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild variant="destructive">
                  <form action={logOut}>
                    <button type="submit" className="w-full flex items-center gap-2">
                      <LogOut className="h-4 w-4" />
                      {s.signOut}
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

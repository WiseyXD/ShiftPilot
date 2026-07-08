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
  Store,
  MessageCircle,
  LogOut,
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
import { Badge } from "@/components/ui/badge"
import { logOut } from "@/app/actions/auth"

interface Props {
  locations: { id: string; name: string }[]
  user: { email: string; plan: string }
}

export function AppSidebar({ locations, user }: Props) {
  const pathname = usePathname()
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

  const locationNav = activeLocationId
    ? [
        { label: "Overview", icon: Home, href: `/dashboard/${activeLocationId}` },
        { label: "Schedules", icon: Calendar, href: `/dashboard/${activeLocationId}/schedules` },
        { label: "Employees", icon: Users, href: `/dashboard/${activeLocationId}/employees` },
        { label: "WhatsApp", icon: MessageCircle, href: `/dashboard/${activeLocationId}/whatsapp` },
        { label: "Templates", icon: ClipboardList, href: `/dashboard/${activeLocationId}/templates` },
        { label: "Audit log", icon: Activity, href: `/dashboard/${activeLocationId}/audit-log` },
        { label: "Analytics", icon: BarChart3, href: `/dashboard/${activeLocationId}/analytics` },
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
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-display text-lg font-semibold tracking-tight text-sidebar-foreground">ShiftPilot</span>
            <span className="text-xs text-sidebar-foreground/60 truncate">AI shift scheduling</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Locations */}
        <SidebarGroup>
          <SidebarGroupLabel>Locations</SidebarGroupLabel>
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
                <SidebarMenuButton asChild tooltip="Add location">
                  <Link href="/dashboard/locations/new" className="text-sidebar-foreground/70">
                    <Plus />
                    <span>Add location</span>
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

        {/* Network */}
        <SidebarGroup>
          <SidebarGroupLabel>Network</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/dashboard/marketplace")}
                  tooltip="Staff marketplace"
                >
                  <Link href="/dashboard/marketplace">
                    <Store />
                    <span>Marketplace</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
                  <p className="text-xs text-slate-500 font-normal">Signed in as</p>
                  <p className="text-sm font-medium truncate">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/billing">
                    <CreditCard />
                    Billing & plan
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild variant="destructive">
                  <form action={logOut}>
                    <button type="submit" className="w-full flex items-center gap-2">
                      <LogOut className="h-4 w-4" />
                      Sign out
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

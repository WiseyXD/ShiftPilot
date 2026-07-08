"use client"

import {
    Calendar,
    MessageSquare,
    Users,
    BarChart3,
} from "lucide-react"

import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarHeader,
    SidebarFooter,
} from "@/components/ui/sidebar"

export function AppSidebar({ tab, setTab }: any) {
    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <div className="px-2 py-2">
                    <div className="font-semibold text-lg">Covrly</div>
                    <div className="text-xs text-muted-foreground">
                        Smart scheduling
                    </div>
                </div>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Main</SidebarGroupLabel>

                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    isActive={tab === "schedule"}
                                    onClick={() => setTab("schedule")}
                                >
                                    <Calendar className="h-4 w-4" />
                                    <span>Schedule</span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>

                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    isActive={tab === "chat"}
                                    onClick={() => setTab("chat")}
                                >
                                    <MessageSquare className="h-4 w-4" />
                                    <span>Assistant</span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                {/* Mock sections */}
                <SidebarGroup>
                    <SidebarGroupLabel>Insights</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton>
                                    <BarChart3 className="h-4 w-4" />
                                    <span>Analytics</span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>

                            <SidebarMenuItem>
                                <SidebarMenuButton>
                                    <Users className="h-4 w-4" />
                                    <span>Team</span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
                <div className="text-xs text-muted-foreground px-2">
                    MVP • v1.0
                </div>
            </SidebarFooter>
        </Sidebar>
    )
}

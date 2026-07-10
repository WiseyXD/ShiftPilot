import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/prisma/client"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { TopBar } from "@/components/dashboard/top-bar"
import { AgentChatPanel } from "@/components/agent/chat-panel"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const [locations, dbUser] = await Promise.all([
    prisma.location.findMany({
      where: { ownerId: session.user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { language: true },
    }),
  ])
  const language = dbUser?.language === "de" ? "de" : "en"

  return (
    <SidebarProvider>
      <AppSidebar
        locations={locations}
        user={{
          email: session.user.email,
          plan: session.user.stripePlan,
          language,
        }}
      />
      <SidebarInset>
        <TopBar />
        <main className="flex-1 px-6 py-6 bg-background min-h-[calc(100svh-3.5rem)]">
          <div className="max-w-6xl mx-auto w-full">{children}</div>
        </main>
        <AgentChatPanel locations={locations} lang={language} />
      </SidebarInset>
    </SidebarProvider>
  )
}

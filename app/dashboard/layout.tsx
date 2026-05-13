import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/prisma/client"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { TopBar } from "@/components/dashboard/top-bar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const locations = await prisma.location.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  })

  return (
    <SidebarProvider>
      <AppSidebar
        locations={locations}
        user={{
          email: session.user.email,
          plan: session.user.stripePlan,
        }}
      />
      <SidebarInset>
        <TopBar />
        <main className="flex-1 px-6 py-6 bg-slate-50/50 min-h-[calc(100svh-3.5rem)]">
          <div className="max-w-6xl mx-auto w-full">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

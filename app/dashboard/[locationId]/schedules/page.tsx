import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/dashboard/page-header"
import { getUserLang } from "@/lib/i18n/server"
import { ui } from "@/lib/i18n/dashboard"
import { ChevronRight, Calendar } from "lucide-react"

export default async function SchedulesPage({
  params,
}: {
  params: Promise<{ locationId: string }>
}) {
  const { locationId } = await params
  const session = await auth()
  if (!session) redirect("/login")

  const location = await prisma.location.findFirst({
    where: { id: locationId, ownerId: session.user.id },
    include: { schedules: { orderBy: { weekStart: "desc" } } },
  })
  if (!location) notFound()

  const tp = ui(await getUserLang()).pages
  return (
    <div className="space-y-6">
      <PageHeader title={tp.schedulesTitle} description={location.name} />

      {location.schedules.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center text-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Calendar className="h-6 w-6 text-slate-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">No schedules yet</h3>
              <p className="text-sm text-slate-500 mt-1">
                Schedules are generated automatically each week, or via the demo.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {location.schedules.map((sched) => (
              <li key={sched.id}>
                <Link
                  href={`/dashboard/${locationId}/schedules/${sched.id}`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors group"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      w/c{" "}
                      {new Date(sched.weekStart).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Created {new Date(sched.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={
                        sched.status === "PUBLISHED"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : sched.status === "APPROVED"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }
                    >
                      {sched.status}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-600 transition-colors" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { Check } from "lucide-react"

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

import { TopBar } from "@/components/dashboard/top-bar"
import { CreateCafe } from "@/components/dashboard/create-cafe"
import { AddEmployee } from "@/components/dashboard/add-employee"
import { EmployeeList } from "@/components/dashboard/employee-list"
import { ScheduleView } from "@/components/dashboard/schedule-view"
import { ChatWindows } from "@/components/dashboard/chat-window"
import { Button } from "@/components/ui/button"
import { AssistantPanel } from "@/components/dashboard/assistant-panel"
import { DotPattern } from "@/components/ui/dot-pattern"
import { cn } from "@/lib/utils"

export default function Page() {
  const [tab, setTab] = useState("schedule")
  const [cafe, setCafe] = useState<any>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [schedule, setSchedule] = useState<any>(null)

  const [activeChats, setActiveChats] = useState<string[]>([])
  const [messages, setMessages] = useState<any>({})

  const [loading, setLoading] = useState(false)



  const cafeForm = useForm()
  const empForm = useForm()


  useEffect(() => {
    loadInitialData()

    const handleScheduleUpdate = () => {
      fetchSchedule()
    }
    window.addEventListener("schedule-updated", handleScheduleUpdate)
    return () => window.removeEventListener("schedule-updated", handleScheduleUpdate)
  }, [schedule?.id])

  const loadInitialData = async () => {
    try {
      const res = await fetch("/api/init")
      const data = await res.json()

      setCafe(data.cafe || null)
      setEmployees(data.employees || [])
      setSchedule(data.schedule || null)
    } catch {
      console.error("Failed to load initial data")
    }
  }

  const resetDemo = async () => {
    try {
      await fetch("/api/demo/reset", {
        method: "POST",
      })

      // reset UI
      setCafe(null)
      setEmployees([])
      setSchedule(null)

      toast.success("Demo reset successful")
    } catch {
      toast.error("Failed to reset demo")
    }
  }

  // Create Cafe
  const createCafe = async (data: any) => {
    setLoading(true)
    try {
      const res = await fetch("/api/cafe", {
        method: "POST",
        body: JSON.stringify(data),
      })

      const json = await res.json()
      setCafe(json)
      cafeForm.reset()

      toast.success("Cafe created successfully")
    } catch {
      toast.error("Failed to create cafe")
    } finally {
      setLoading(false)
    }
  }

  // Add Employee
  const addEmployee = async (data: any) => {
    setLoading(true)
    try {
      const parsedAvailability =
        data.availability?.map((val: string) => {
          const [day, shift] = val.split("-")
          return { day, shift }
        }) || []

      const res = await fetch("/api/employee", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          cafeId: cafe.id,
          availability: parsedAvailability,
        }),
      })

      const json = await res.json()
      setEmployees((prev) => [...prev, json])
      empForm.reset()

      toast.success("Employee added")
    } catch {
      toast.error("Failed to add employee")
    } finally {
      setLoading(false)
    }
  }

  const generateDemoTeam = async () => {
    if (!cafe) return
    setLoading(true)
    try {
      const names = ["Aryan", "Julia", "Niko", "Vedika"]
      // Overlapping availability for all
      const availability = [
        { day: "Monday", shift: "morning" },
        { day: "Monday", shift: "evening" },
        { day: "Tuesday", shift: "morning" },
        { day: "Tuesday", shift: "evening" },
        { day: "Wednesday", shift: "morning" },
        { day: "Wednesday", shift: "evening" },
        { day: "Thursday", shift: "morning" },
        { day: "Thursday", shift: "evening" },
        { day: "Friday", shift: "morning" },
        { day: "Friday", shift: "evening" },
      ]

      const newEmployees: any[] = []
      for (const name of names) {
        const res = await fetch("/api/employee", {
          method: "POST",
          body: JSON.stringify({
            name,
            email: "aryan.s.nag@gmail.com",
            cafeId: cafe.id,
            availability,
          }),
        })
        const json = await res.json()
        newEmployees.push(json)
      }

      setEmployees((prev) => [...prev, ...newEmployees])
      toast.success("Demo team generated!")
    } catch {
      toast.error("Failed to generate demo team")
    } finally {
      setLoading(false)
    }
  }

  const fetchSchedule = async () => {
    if (!schedule?.id) return

    const res = await fetch(`/api/schedule/${schedule.id}`)
    const data = await res.json()
    setSchedule(data)
  }
  // Generate Schedule
  const generateSchedule = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/schedule/generate", {
        method: "POST",
        body: JSON.stringify({
          cafeId: cafe.id,
          weekStart: new Date(),
        }),
      })

      const json = await res.json()
      setSchedule(json)

      toast.success("Schedule generated")
    } catch {
      toast.error("Failed to generate schedule")
    } finally {
      setLoading(false)
    }
  }

  const toggleChat = (id: string) => {
    setActiveChats((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  const acceptShift = async (shift: any) => {
    try {
      await fetch("/api/shift/accept", {
        method: "POST",
        body: JSON.stringify({ shiftId: shift.id }),
      })

      await fetchSchedule()

      toast.success("Shift accepted")
    } catch {
      toast.error("Failed to accept shift")
    }
  }

  const declineShift = async (shift: any) => {
    try {
      await fetch("/api/reply", {
        method: "POST",
        body: JSON.stringify({
          employeeId: shift.employeeId,
          shiftId: shift.id,
        }),
      })

      // 🔥 trigger LLM reschedule
      const res = await fetch("/api/schedule/reschedule", {
        method: "POST",
        body: JSON.stringify({
          scheduleId: schedule.id,
        }),
      });
      const data = await res.json()
      // 🔥 refresh UI
      await fetchSchedule()
      data.updates.forEach((u: any) => {
        if (u.employeeId) {
          toast.success(u.reason)
        } else {
          toast.warning("Unassigned shift → manager needed")
        }
      })
    } catch {
      toast.error("Error updating shift")
    }
  }

  const reschedule = async () => {
    if (!schedule) return

    try {
      const res = await fetch("/api/schedule/reschedule", {
        method: "POST",
        body: JSON.stringify({
          scheduleId: schedule.id,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        toast.error("Failed to reschedule")
        return
      }

      // 🔥 REFETCH schedule (important)
      await fetchSchedule()

      toast.success("Schedule rebalanced")
    } catch {
      toast.error("Error rescheduling")
    }
  }

  const steps = [
    { id: 1, name: 'Setup Cafe' },
    { id: 2, name: 'Add Team' },
    { id: 3, name: 'Generate Schedule' },
    { id: 4, name: 'View Calendar' },
  ]

  const currentStep = schedule ? 4 : (cafe && employees.length > 0 ? 3 : (cafe ? 2 : 1))

  return (
    <SidebarProvider>
      <AppSidebar tab={tab} setTab={setTab} />

      <SidebarInset className="h-screen flex flex-col bg-slate-50/50 relative overflow-hidden">
        <DotPattern className={cn("[mask-image:radial-gradient(800px_circle_at_center,white,transparent)]", "opacity-40")} />
        <TopBar tab={tab} cafe={cafe} />

        <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto space-y-6 z-10 w-full">
          {tab === "schedule" ? (
            <div className="space-y-8 w-full">
              {/* Stepper */}
              <div className="mb-8 w-full max-w-2xl mx-auto px-4 mt-4">
                <div className="flex items-center justify-between w-full relative">
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[2px] bg-slate-200 -z-10" />
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] bg-black -z-10 transition-all duration-500 ease-in-out" style={{ width: `${((currentStep - 1) / 3) * 100}%` }} />
                  {steps.map((step) => (
                    <div key={step.id} className="flex flex-col items-center gap-2 bg-transparent px-2">
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-500",
                        currentStep > step.id ? "bg-black text-white scale-100" :
                          currentStep === step.id ? "bg-black text-white ring-4 ring-slate-200 scale-110" :
                            "bg-white border-2 border-slate-200 text-slate-400 scale-100"
                      )}>
                        {currentStep > step.id ? <Check className="w-5 h-5" /> : step.id}
                      </div>
                      <span className={cn("text-xs font-semibold uppercase tracking-wider transition-colors duration-300 mt-2", currentStep >= step.id ? "text-black" : "text-slate-400")}>
                        {step.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Main Content Area */}
              <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-sm border border-slate-200/60 relative overflow-hidden">
                {/* Decorative glow */}
                <div className="absolute -top-40 -right-40 w-96 h-96 bg-black/[0.03] rounded-full blur-3xl pointer-events-none" />

                {currentStep === 1 && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-md mx-auto">
                    <div className="mb-8 text-center">
                      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">☕</div>
                      <h2 className="text-3xl font-bold tracking-tight">Welcome to ShiftPilot</h2>
                      <p className="text-slate-500 mt-2">Let's start by setting up your cafe profile. This will only take a moment.</p>
                    </div>
                    <CreateCafe form={cafeForm} onSubmit={createCafe} />
                  </div>
                )}

                {(currentStep === 2 || currentStep === 3) && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                          <span className="text-xl">👥</span> Build your team
                        </h2>
                        <p className="text-slate-500 mt-1 text-sm">Add employees and their availability.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {employees.length === 0 && (
                          <Button 
                            variant="outline" 
                            onClick={generateDemoTeam}
                            disabled={loading}
                            className="rounded-xl border-dashed border-2 bg-slate-50 hover:bg-slate-100 h-10"
                          >
                            ⚡ Generate Demo Team
                          </Button>
                        )}
                        {currentStep === 3 && (
                          <button
                            onClick={generateSchedule}
                            disabled={loading}
                            className="bg-black text-white px-6 py-2.5 h-10 rounded-xl text-sm font-semibold hover:bg-black/90 transition shadow-lg shadow-black/10 disabled:opacity-50 flex items-center gap-2 group"
                          >
                            {loading ? (
                              <span className="animate-spin text-lg leading-none">↻</span>
                            ) : (
                              <span className="text-lg leading-none group-hover:scale-110 transition-transform">✨</span>
                            )}
                            {loading ? "Generating..." : "Generate Schedule"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                      <div className="lg:col-span-5 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                        <h3 className="text-sm font-semibold mb-4 text-slate-800">Add New Employee</h3>
                        <AddEmployee form={empForm} onSubmit={addEmployee} />
                      </div>
                      <div className="lg:col-span-7">
                         <h3 className="text-sm font-semibold mb-4 text-slate-800">Team Roster ({employees.length})</h3>
                        <EmployeeList employees={employees} onChat={toggleChat} />
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 4 && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col min-h-[500px]">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                      <div>
                        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                          <span className="text-xl">📅</span> Weekly Schedule
                        </h2>
                        <p className="text-slate-500 mt-1 text-sm">Manage and rebalance your shifts.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={reschedule} className="rounded-xl bg-white hover:bg-slate-50 border-slate-200">
                          ⚖️ Rebalance
                        </Button>
                        <Button variant="ghost" onClick={() => setSchedule(null)} className="rounded-xl text-slate-500 hover:text-slate-800">
                          Reset
                        </Button>
                      </div>
                    </div>

                    <div className="flex-1 w-full flex flex-col">
                      <ScheduleView schedule={schedule} onAccept={acceptShift} onDecline={declineShift} onChat={toggleChat} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (<div className="h-full flex flex-col">
            <AssistantPanel schedule={schedule} />
          </div>
          )}

        </div>
        <div className="p-6 pt-0 mx-auto max-w-4xl w-full z-10">
          <Button variant="destructive" onClick={resetDemo} className="w-full sm:w-auto">
            Reset Demo
          </Button>
        </div>

      </SidebarInset>
      <ChatWindows
        activeChats={activeChats}
        employees={employees}
        schedule={schedule}
        toggleChat={toggleChat}
        onAcceptShift={acceptShift}
        onDeclineShift={declineShift}
      />

    </SidebarProvider>
  )
}

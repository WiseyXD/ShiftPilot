"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

import { TopBar } from "@/components/dashboard/top-bar"
import { CreateCafe } from "@/components/dashboard/create-cafe"
import { AddEmployee } from "@/components/dashboard/add-employee"
import { EmployeeList } from "@/components/dashboard/employee-list"
import { ScheduleView } from "@/components/dashboard/schedule-view"
import { ChatWindows } from "@/components/dashboard/chat-window"
import { Button } from "@/components/ui/button"

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

  const sendMessage = async (employeeId: string, shiftId: string) => {
    const content = messages[employeeId]

    if (!content || !shiftId) {
      toast.error("Select a shift")
      return
    }

    setLoading(true)

    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        body: JSON.stringify({
          employeeId,
          shiftId, // 🔥 NEW
          content,
        }),
      })

      const reply = await res.json()

      if (!reply.success) {
        toast.error(reply.error)
        return
      }

      // ✅ update UI
      if (reply.updatedShift && schedule) {
        setSchedule((prev: any) => ({
          ...prev,
          shifts: prev.shifts.map((s: any) =>
            s.id === reply.updatedShift.id ? reply.updatedShift : s
          ),
        }))
      }

      toast.success("Shift updated")
    } catch {
      toast.error("Failed to process request")
    } finally {
      setLoading(false)
      setMessages((prev: any) => ({
        ...prev,
        [employeeId]: "",
      }))
    }
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
      await fetch("/api/schedule/reschedule", {
        method: "POST",
        body: JSON.stringify({
          scheduleId: schedule.id,
        }),
      })

      // 🔥 refresh UI
      await fetchSchedule()

      toast.success("Shift declined & rescheduled")
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

  return (
    <SidebarProvider>
      <AppSidebar tab={tab} setTab={setTab} />

      <SidebarInset className="h-screen flex flex-col bg-slate-50">
        <TopBar tab={tab} cafe={cafe} />

        <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto space-y-6">
          {tab === "schedule" ? (
            <>
              {!cafe && (
                <CreateCafe form={cafeForm} onSubmit={createCafe} />
              )}

              {cafe && (
                <>
                  <AddEmployee form={empForm} onSubmit={addEmployee} />

                  <EmployeeList
                    employees={employees}
                    onChat={toggleChat}
                  />

                  {employees.length > 0 && (
                    <button
                      onClick={generateSchedule}
                      disabled={loading}
                      className="bg-black text-white px-5 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                    >
                      {loading ? "Generating..." : "Generate Schedule"}
                    </button>
                  )}

                  <ScheduleView schedule={schedule} onAccept={acceptShift} onDecline={declineShift} />
                  <Button onClick={reschedule}>
                    Rebalance Schedule
                  </Button>
                </>
              )}
            </>
          ) : (<div className="h-full flex flex-col">
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Ask anything about your schedule
            </div>
          </div>
          )}

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

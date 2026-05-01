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
      const res = await fetch("/api/employee", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          cafeId: cafe.id,
          availability: [],
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

  const sendMessage = async (id: string) => {
    const content = messages[id]
    if (!content) return

    setLoading(true)

    try {
      await fetch("/api/reply", {
        method: "POST",
        body: JSON.stringify({ employeeId: id, content }),
      })

      await generateSchedule()

      toast.success("Schedule updated via AI")
    } catch {
      toast.error("Failed to process request")
    } finally {
      setLoading(false)
      setMessages((prev: any) => ({ ...prev, [id]: "" }))
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

                  <ScheduleView schedule={schedule} />
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
        <ChatWindows
          activeChats={activeChats}
          employees={employees}
          messages={messages}
          setMessages={setMessages}
          sendMessage={sendMessage}
          toggleChat={toggleChat}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}

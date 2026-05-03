"use client"

import { cn } from "@/lib/utils"

export function ScheduleView({
    schedule,
    onAccept,
    onDecline,
    onChat,
}: any) {
    if (!schedule) return null

    const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    const SHIFTS = ["morning", "evening"]

    const getShift = (day: string, shift: string) => {
        return schedule.shifts.find((s: any) => s.day === day && s.shift === shift)
    }

    const getStatusColor = (status: string) => {
        switch (status?.toLowerCase()) {
            case "accepted":
                return "bg-green-100 text-green-800 border-green-200"
            case "declined":
                return "bg-red-100 text-red-800 border-red-200"
            case "pending":
                return "bg-yellow-100 text-yellow-800 border-yellow-200"
            default:
                return "bg-slate-100 text-slate-600 border-slate-200"
        }
    }

    return (
        <div className="w-full h-full overflow-hidden flex flex-col bg-slate-50/50 rounded-2xl border border-slate-200">
            {/* Header row (Days) */}
            <div className="grid grid-cols-6 border-b border-slate-200 bg-white">
                <div className="p-4 border-r border-slate-200 flex items-center justify-center font-semibold text-slate-500 text-sm">
                    Time
                </div>
                {DAYS.map((day) => (
                    <div key={day} className="p-4 text-center font-semibold text-slate-800 text-sm border-r border-slate-200 last:border-r-0">
                        {day}
                    </div>
                ))}
            </div>

            {/* Shift Rows */}
            <div className="flex-1 overflow-y-auto">
                {SHIFTS.map((shiftTime) => (
                    <div key={shiftTime} className="grid grid-cols-6 border-b border-slate-200 last:border-b-0 min-h-[140px]">
                        <div className="p-4 border-r border-slate-200 bg-white flex items-center justify-center">
                            <span className="font-semibold text-slate-700 capitalize rotate-[-90deg] sm:rotate-0 tracking-wider">
                                {shiftTime}
                            </span>
                        </div>
                        {DAYS.map((day) => {
                            const s = getShift(day, shiftTime)
                            return (
                                <div key={`${day}-${shiftTime}`} className="p-2 border-r border-slate-200 last:border-r-0 bg-slate-50/30 hover:bg-slate-100/50 transition-colors duration-300">
                                    {s ? (
                                        <div className="h-full w-full bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col justify-between group">
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border", getStatusColor(s.status))}>
                                                        {s.status || "unassigned"}
                                                    </span>
                                                    {s.employee && (
                                                        <button 
                                                            onClick={() => onChat && onChat(s.employee.id)}
                                                            className="text-slate-400 hover:text-blue-600 transition-colors p-1 rounded-full hover:bg-blue-50"
                                                            title="Message employee"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="font-medium text-slate-900 text-sm truncate">
                                                    {s.employee?.name || <span className="text-slate-400 italic">Unassigned</span>}
                                                </div>
                                            </div>
                                            
                                        </div>
                                    ) : (
                                        <div className="h-full w-full rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex items-center justify-center">
                                            <span className="text-xs text-slate-400 font-medium">Off</span>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ))}
            </div>
        </div>
    )
}

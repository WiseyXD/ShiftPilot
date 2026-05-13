import { Button, Heading, Link, Section, Text } from "@react-email/components"
import * as React from "react"
import { BaseLayout } from "../layout"

interface ShiftEntry {
  templateName: string
  date: string
  startTime: string
  endTime: string
  acceptUrl: string
  declineUrl: string
  swapUrl?: string
  calendarUrl?: string
}

interface ShiftAssignmentEmailProps {
  employeeName: string
  locationName: string
  weekLabel: string
  shifts: ShiftEntry[]
}

export function ShiftAssignmentEmail({
  employeeName,
  locationName,
  weekLabel,
  shifts,
}: ShiftAssignmentEmailProps) {
  return (
    <BaseLayout preview={`Your schedule for ${locationName} — ${weekLabel}`}>
      <Heading style={h1}>Your shifts for {weekLabel}</Heading>
      <Text style={text}>
        Hi {employeeName}, here are your assigned shifts at {locationName}. Please accept or
        decline each one below.
      </Text>

      {shifts.map((shift, i) => (
        <Section key={i} style={shiftCard}>
          <Text style={shiftTitle}>
            {shift.templateName} · {shift.date}
          </Text>
          <Text style={shiftTime}>
            {shift.startTime} – {shift.endTime}
          </Text>
          <div style={buttonRow}>
            <Button style={acceptButton} href={shift.acceptUrl}>
              Accept
            </Button>
            <Button style={declineButton} href={shift.declineUrl}>
              Decline
            </Button>
          </div>
          {shift.swapUrl && (
            <Link style={swapLink} href={shift.swapUrl}>
              Request a swap
            </Link>
          )}
          {shift.calendarUrl && (
            <Link style={swapLink} href={shift.calendarUrl}>
              Add to Google Calendar
            </Link>
          )}
        </Section>
      ))}
    </BaseLayout>
  )
}

const h1 = { color: "#0f172a", fontSize: "22px", fontWeight: "700", margin: "0 0 16px" }
const text = { color: "#334155", fontSize: "15px", lineHeight: "24px", margin: "0 0 24px" }
const shiftCard = {
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "12px",
}
const shiftTitle = { color: "#0f172a", fontWeight: "600", fontSize: "15px", margin: "0 0 4px" }
const shiftTime = { color: "#64748b", fontSize: "13px", margin: "0 0 12px" }
const buttonRow = { display: "flex", gap: "8px" }
const acceptButton = {
  backgroundColor: "#16a34a",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: "600",
  padding: "8px 16px",
  textDecoration: "none",
}
const declineButton = {
  backgroundColor: "#f1f5f9",
  borderRadius: "6px",
  color: "#ef4444",
  fontSize: "13px",
  fontWeight: "600",
  padding: "8px 16px",
  textDecoration: "none",
}

const swapLink = {
  color: "#64748b",
  fontSize: "12px",
  display: "block",
  marginTop: "8px",
  textDecoration: "underline",
}

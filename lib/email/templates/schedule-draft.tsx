import { Button, Heading, Text } from "@react-email/components"
import * as React from "react"
import { BaseLayout } from "../layout"

interface ScheduleDraftEmailProps {
  locationName: string
  weekStart: string
  filledCount: number
  totalCount: number
  unfilledCount: number
  approveUrl: string
  reviewUrl: string
}

export function ScheduleDraftEmail({
  locationName,
  weekStart,
  filledCount,
  totalCount,
  unfilledCount,
  approveUrl,
  reviewUrl,
}: ScheduleDraftEmailProps) {
  const week = new Date(weekStart).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })

  return (
    <BaseLayout preview={`Schedule draft ready for ${locationName} — w/c ${week}`}>
      <Heading style={h1}>Schedule draft ready</Heading>
      <Text style={text}>
        The schedule for <strong>{locationName}</strong> (week commencing {week}) has been
        generated and is ready for your review.
      </Text>
      <Text style={stats}>
        {filledCount}/{totalCount} shifts filled
        {unfilledCount > 0 && ` · ${unfilledCount} unfilled (need manual assignment)`}
      </Text>
      {unfilledCount > 0 && (
        <Text style={warning}>
          ⚠️ {unfilledCount} shift{unfilledCount !== 1 ? "s" : ""} could not be filled due to
          availability or role constraints. Please assign them manually before approving.
        </Text>
      )}
      <Button style={primaryButton} href={approveUrl}>
        Approve and notify employees
      </Button>
      <Text style={orText}>or</Text>
      <Button style={secondaryButton} href={reviewUrl}>
        Review and edit first
      </Button>
    </BaseLayout>
  )
}

const h1 = { color: "#0f172a", fontSize: "22px", fontWeight: "700", margin: "0 0 16px" }
const text = { color: "#334155", fontSize: "15px", lineHeight: "24px", margin: "0 0 16px" }
const stats = { color: "#0f172a", fontSize: "15px", fontWeight: "600", margin: "0 0 16px" }
const warning = {
  color: "#92400e",
  backgroundColor: "#fef3c7",
  borderRadius: "6px",
  padding: "10px 14px",
  fontSize: "14px",
  margin: "0 0 24px",
}
const primaryButton = {
  backgroundColor: "#0f172a",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: "600",
  padding: "12px 24px",
  textDecoration: "none",
  marginBottom: "12px",
}
const orText = { color: "#94a3b8", fontSize: "13px", margin: "0 0 12px" }
const secondaryButton = {
  backgroundColor: "#f1f5f9",
  borderRadius: "6px",
  color: "#0f172a",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: "600",
  padding: "12px 24px",
  textDecoration: "none",
}

import { Button, Heading, Link, Section, Text } from "@react-email/components"
import * as React from "react"
import { BaseLayout } from "../layout"

interface LoanConsentEmailProps {
  workerName: string
  role: string
  venueName: string
  venueAddress: string | null
  dateLabel: string
  window: string
  rateLabel: string
  acceptUrl: string
  declineUrl: string
}

export function LoanConsentEmail({
  workerName,
  role,
  venueName,
  venueAddress,
  dateLabel,
  window,
  rateLabel,
  acceptUrl,
  declineUrl,
}: LoanConsentEmailProps) {
  return (
    <BaseLayout preview={`Work a ${role} shift at ${venueName}?`}>
      <Heading style={h1}>Want to pick up a shift at another venue?</Heading>
      <Text style={text}>
        Hi {workerName}, your manager agreed to lend you out for one shift — but it only
        happens if you want it. Here are the details:
      </Text>
      <Section style={details}>
        <Text style={detailRow}>
          <strong>Where:</strong> {venueName}
          {venueAddress ? ` — ${venueAddress}` : ""}
        </Text>
        <Text style={detailRow}>
          <strong>When:</strong> {dateLabel}, {window}
        </Text>
        <Text style={detailRow}>
          <strong>Role:</strong> {role}
        </Text>
        <Text style={detailRow}>
          <strong>Rate:</strong> {rateLabel}
        </Text>
      </Section>
      <Button style={button} href={acceptUrl}>
        Yes, I&apos;ll work it
      </Button>
      <Link style={secondaryLink} href={declineUrl}>
        No thanks — I&apos;d rather not
      </Link>
      <Text style={help}>
        Nothing is booked until you accept. Questions? Reply to this email or talk to your
        manager.
      </Text>
    </BaseLayout>
  )
}

const h1 = {
  color: "#0f172a",
  fontSize: "22px",
  fontWeight: "700",
  margin: "0 0 16px",
}

const text = {
  color: "#334155",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 16px",
}

const details = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 24px",
}

const detailRow = {
  color: "#334155",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0",
}

const button = {
  backgroundColor: "#16a34a",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: "600",
  padding: "12px 24px",
  textDecoration: "none",
}

const secondaryLink = {
  color: "#64748b",
  fontSize: "14px",
  display: "block",
  marginTop: "12px",
  textDecoration: "underline",
}

const help = {
  color: "#94a3b8",
  fontSize: "13px",
  marginTop: "32px",
}

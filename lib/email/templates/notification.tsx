import { Button, Heading, Link, Text } from "@react-email/components"
import * as React from "react"
import { BaseLayout } from "../layout"

interface NotificationEmailProps {
  heading: string
  body: string
  ctaLabel?: string
  ctaUrl?: string
  secondaryCtaLabel?: string
  secondaryCtaUrl?: string
}

export function NotificationEmail({
  heading,
  body,
  ctaLabel,
  ctaUrl,
  secondaryCtaLabel,
  secondaryCtaUrl,
}: NotificationEmailProps) {
  return (
    <BaseLayout preview={heading}>
      <Heading style={h1}>{heading}</Heading>
      <Text style={text}>{body}</Text>
      {ctaLabel && ctaUrl && (
        <Button style={button} href={ctaUrl}>
          {ctaLabel}
        </Button>
      )}
      {secondaryCtaLabel && secondaryCtaUrl && (
        <Link style={secondaryLink} href={secondaryCtaUrl}>
          {secondaryCtaLabel}
        </Link>
      )}
      <Text style={help}>
        Questions? Reply to this email or contact your manager.
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
  margin: "0 0 24px",
}

const button = {
  backgroundColor: "#0f172a",
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

import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import * as React from "react"

interface BaseLayoutProps {
  preview: string
  children: React.ReactNode
}

export function BaseLayout({ preview, children }: BaseLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Text style={logo}>Covrly</Text>
          </Section>
          <Section style={content}>{children}</Section>
          <Section style={footer}>
            <Text style={footerText}>
              Covrly — AI-powered shift scheduling
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const body = {
  backgroundColor: "#f4f1e8",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}

const container = {
  backgroundColor: "#fffcf7",
  margin: "0 auto",
  padding: "0",
  maxWidth: "560px",
  borderRadius: "8px",
  overflow: "hidden" as const,
}

const header = {
  backgroundColor: "#0e5f56",
  padding: "20px 32px",
}

const logo = {
  color: "#ffffff",
  fontSize: "20px",
  fontWeight: "700",
  margin: "0",
}

const content = {
  padding: "32px",
}

const footer = {
  borderTop: "1px solid #e6e2d5",
  padding: "20px 32px",
}

const footerText = {
  color: "#6b6a60",
  fontSize: "12px",
  margin: "0",
}

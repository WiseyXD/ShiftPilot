import { Resend } from "resend";
import { render } from "@react-email/render";
import * as React from "react";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM ?? "ShiftPilot <onboarding@resend.dev>";

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
}

export async function sendEmail({ to, subject, react }: SendEmailOptions) {
  const html = await render(react);

  // In dev, redirect all mail to a single address to avoid domain verification issues
  const override = process.env.DEV_EMAIL_OVERRIDE;
  const resolvedTo = override ? [override] : Array.isArray(to) ? to : [to];

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: resolvedTo,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}

import { Resend } from "resend";
import { render } from "@react-email/render";
import * as React from "react";

// Lazy: Resend's constructor throws without a key, and Next imports this
// module at BUILD time while collecting page data — the client must only be
// created when an email is actually sent.
let _resend: Resend | null = null;
const resendClient = () => (_resend ??= new Resend(process.env.RESEND_API_KEY));

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

  const { data, error } = await resendClient().emails.send({
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

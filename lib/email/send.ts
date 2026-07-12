import { Resend } from "resend";
import { render } from "@react-email/render";
import * as React from "react";

// Lazy: Resend's constructor throws without a key, and Next imports this
// module at BUILD time while collecting page data — the client must only be
// created when an email is actually sent.
let _resend: Resend | null = null;
const resendClient = () => (_resend ??= new Resend(process.env.RESEND_API_KEY));

const FROM = process.env.EMAIL_FROM ?? "Covrly <onboarding@resend.dev>";

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
}

export async function sendEmail({ to, subject, react }: SendEmailOptions) {
  // Best-effort: email must never break a flow. Without a Resend key (e.g. the
  // WhatsApp-only demo) or on any send error we log and carry on — the WhatsApp
  // thread and durable workflow are the source of truth, not email.
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email skipped: no RESEND_API_KEY] "${subject}"`);
    return null;
  }
  try {
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
      console.error(`[email failed] "${subject}": ${error.message}`);
      return null;
    }
    return data;
  } catch (err) {
    console.error(`[email threw] "${subject}":`, err);
    return null;
  }
}

import nodemailer from "nodemailer";
import { brand } from "@/config/brand";

/**
 * Transactional e-mail through the same transport as sign-in links:
 * EMAIL_SERVER (your own SMTP) when set, otherwise the Resend HTTP API.
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export function getEmailFrom(): string {
  return process.env.EMAIL_FROM ?? `${brand.name} <login@example.com>`;
}

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const from = getEmailFrom();
  const smtpServer = process.env.EMAIL_SERVER;

  if (smtpServer) {
    const transport = nodemailer.createTransport(smtpServer);
    const result = await transport.sendMail({ from, ...email });
    const failed = [...(result.rejected ?? []), ...(result.pending ?? [])];
    if (failed.length) throw new Error(`E-mail not delivered to ${failed.join(", ")}`);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Configure EMAIL_SERVER or RESEND_API_KEY to send e-mail");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: email.to, subject: email.subject, html: email.html, text: email.text }),
  });
  if (!response.ok) {
    throw new Error(`Resend error ${response.status}: ${await response.text()}`);
  }
}

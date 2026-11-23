import nodemailer from "nodemailer";
import { brand } from "@/config/brand";
import { prisma } from "@/lib/db/client";

/**
 * Transactional e-mail through the same transport as sign-in links:
 * EMAIL_SERVER (your own SMTP) when set, otherwise the Resend HTTP API.
 *
 * Every failure, whatever the e-mail, becomes an event in the admin's
 * Diagnostics: which e-mail, the recipient masked (b***@gmail.com) and the
 * provider's own message. The error is then thrown as before, so each caller
 * keeps deciding what the person sees.
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Which e-mail it is, for the Diagnostics event. */
export type EmailKind =
  | "signup_confirmation"
  | "signup_confirmation_resend"
  | "already_registered"
  | "account_ready"
  | "welcome_invitation"
  | "admin_new_signup"
  | "password_reset"
  | "client_approved"
  | "client_rejected"
  | "magic_link"
  | "test";

export const EMAIL_KIND_LABEL: Record<EmailKind, string> = {
  signup_confirmation: "sign-up confirmation",
  signup_confirmation_resend: "sign-up confirmation (sent again)",
  already_registered: "sign-up attempt on an existing account",
  account_ready: "welcome (account active)",
  welcome_invitation: "welcome invitation (set your password)",
  admin_new_signup: "new sign-up notice to the admin",
  password_reset: "password recovery",
  client_approved: "sign-up approved",
  client_rejected: "sign-up rejected",
  magic_link: "sign-in link",
  test: "test e-mail (admin settings)",
};

export type EmailProvider = "resend" | "smtp" | "none";

/** The provider refused or could not take the e-mail; `providerMessage` is its own words. */
export class EmailSendError extends Error {
  constructor(
    public readonly provider: EmailProvider,
    public readonly providerMessage: string,
    public readonly status?: number
  ) {
    super(`${provider === "resend" ? "Resend" : provider === "smtp" ? "SMTP" : "E-mail"}${status ? ` ${status}` : ""}: ${providerMessage}`);
    this.name = "EmailSendError";
  }
}

export function getEmailFrom(): string {
  return process.env.EMAIL_FROM ?? `${brand.name} <login@example.com>`;
}

/** How e-mail goes out now (for the admin's test): the provider, the sender and, for SMTP, the server. */
export function emailTransport(): { provider: EmailProvider; from: string; server: string | null } {
  const smtpServer = process.env.EMAIL_SERVER;
  if (smtpServer) {
    let server: string | null = null;
    try {
      const url = new URL(smtpServer);
      server = `${url.hostname}${url.port ? `:${url.port}` : ""}`;
    } catch {
      server = null;
    }
    return { provider: "smtp", from: getEmailFrom(), server };
  }
  return { provider: process.env.RESEND_API_KEY ? "resend" : "none", from: getEmailFrom(), server: null };
}

/** b***@gmail.com: enough to tell who, without the whole address in the logs. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${address[0]}***${address.slice(at)}`;
}

/** Resend's error body is JSON ({ name, message }); keep its words, not the wrapper. */
function resendMessage(body: string): string {
  try {
    const data = JSON.parse(body) as { name?: string; message?: string };
    if (data.message) return data.name ? `${data.name}: ${data.message}` : data.message;
  } catch {
    // not JSON: the body as sent
  }
  return body.trim() || "No details from Resend";
}

async function deliver(email: OutgoingEmail): Promise<{ provider: EmailProvider; id: string | null }> {
  const from = getEmailFrom();
  const smtpServer = process.env.EMAIL_SERVER;

  if (smtpServer) {
    try {
      const transport = nodemailer.createTransport(smtpServer);
      const result = await transport.sendMail({ from, ...email });
      const failed = [...(result.rejected ?? []), ...(result.pending ?? [])];
      if (failed.length) throw new EmailSendError("smtp", `E-mail not delivered to ${failed.map((a) => maskEmail(String(a))).join(", ")}${result.response ? ` (${result.response})` : ""}`);
      return { provider: "smtp", id: result.messageId ?? null };
    } catch (err) {
      if (err instanceof EmailSendError) throw err;
      const smtp = err as { message?: string; responseCode?: number };
      throw new EmailSendError("smtp", smtp.message ?? String(err), smtp.responseCode);
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailSendError("none", "Configure EMAIL_SERVER or RESEND_API_KEY to send e-mail");

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: email.to, subject: email.subject, html: email.html, text: email.text }),
    });
  } catch (err) {
    throw new EmailSendError("resend", `Could not reach Resend: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!response.ok) {
    throw new EmailSendError("resend", resendMessage(await response.text()), response.status);
  }
  const data = (await response.json().catch(() => ({}))) as { id?: string };
  return { provider: "resend", id: data.id ?? null };
}

/** Records a failed send in the admin's Diagnostics (never the full address, never the content). */
async function recordFailure(kind: EmailKind, to: string, error: EmailSendError): Promise<void> {
  await prisma.operationalEvent
    .create({
      data: {
        source: "SYSTEM",
        level: "ERROR",
        message: `E-mail not sent: ${EMAIL_KIND_LABEL[kind]} to ${maskEmail(to)}`,
        payload: {
          kind,
          to: maskEmail(to),
          provider: error.provider,
          ...(error.status ? { status: error.status } : {}),
          error: error.providerMessage.slice(0, 1000),
        },
      },
    })
    .catch((recordError) => console.error("[email] Could not record the failure:", recordError));
}

export async function sendEmail(email: OutgoingEmail & { kind: EmailKind }): Promise<{ provider: EmailProvider; id: string | null }> {
  const { kind, ...message } = email;
  try {
    return await deliver(message);
  } catch (err) {
    const error = err instanceof EmailSendError ? err : new EmailSendError(emailTransport().provider, err instanceof Error ? err.message : String(err));
    await recordFailure(kind, message.to, error);
    throw error;
  }
}

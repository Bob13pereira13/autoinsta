import { NextRequest } from "next/server";
import { z } from "zod";
import { AdminError } from "@/lib/admin/clients";
import { withAdmin } from "@/lib/admin/http";
import { EmailSendError, emailTransport, sendEmail } from "@/lib/email/send";
import { testEmail } from "@/lib/email/templates";
import { getBaseUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * POST { to? } — sends the test e-mail (to the admin's own address unless
 * another is given) and answers what happened: the provider, the sender and
 * the provider's id, or the provider's exact error. A failure is also
 * recorded in Diagnostics, like any other e-mail.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return withAdmin(async (adminEmail) => {
    const parsed = z.string().trim().email().max(200).optional().safeParse(body?.to || undefined);
    if (!parsed.success) throw new AdminError("Enter a valid e-mail");
    const to = parsed.data ?? adminEmail;
    const transport = emailTransport();
    const via = transport.provider === "smtp" ? `SMTP${transport.server ? ` ${transport.server}` : ""}` : transport.provider === "resend" ? "Resend" : "—";
    try {
      const sent = await sendEmail({ kind: "test", to, ...testEmail(new URL("/admin/settings", getBaseUrl()).toString(), via) });
      return { sent: true, to, from: transport.from, provider: sent.provider, server: transport.server, id: sent.id };
    } catch (err) {
      const error = err instanceof EmailSendError ? err : new EmailSendError(transport.provider, err instanceof Error ? err.message : String(err));
      return { sent: false, to, from: transport.from, provider: error.provider, server: transport.server, status: error.status ?? null, error: error.providerMessage };
    }
  });
}

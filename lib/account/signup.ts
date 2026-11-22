import { z } from "zod";
import { brand } from "@/config/brand";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { hashPassword, validateNewPassword } from "@/lib/account/password";
import { authTokenUrl, confirmEmailWithToken, createAuthToken, normalizeEmail } from "@/lib/account/tokens";
import { sendEmail } from "@/lib/email/send";
import { adminNewSignupMessage, alreadyRegisteredMessage, verifyEmailMessage } from "@/lib/email/account-emails";
import { getAdminEmails } from "@/lib/platform-admin";
import { hitRateLimit } from "@/lib/security/rate-limit";
import { isSignupAvailable, verifyTurnstile } from "@/lib/security/turnstile";
import { formatDocument, parseDocument } from "@/lib/validation/document";
import { normalizePhone } from "@/lib/validation/phone";

/**
 * Public sign-up (/cadastro). Creates the user and a PENDING_APPROVAL
 * workspace, then e-mails a confirmation link. Signing in needs a confirmed
 * address; the admins are told once the address is confirmed.
 *
 * The response is the same whether or not the e-mail already has an account,
 * so the form cannot be used to find out who is a client: an existing account
 * gets an e-mail saying so instead.
 */

/** Version of the Terms/Privacy Policy accepted: the legal pages' revision date. */
export const LEGAL_VERSION = brand.legal.lastUpdated;

export const SIGNUP_LIMITS = {
  perIpPerHour: 5,
  emailsPerAddressPerHour: 3,
} as const;

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  email: z.string().trim().email("Enter a valid e-mail").max(200),
  password: z.string().max(200),
  companyName: z.string().trim().min(2, "Enter the company name").max(120),
  phone: z.string().trim().min(8, "Enter a valid WhatsApp number").max(30),
  document: z.string().trim().max(30).optional().nullable(),
  acceptTerms: z.literal(true, { message: "Accept the Terms of Use and the Privacy Policy" }),
  turnstileToken: z.string().max(2048).optional().nullable(),
  locale: z.enum(["pt-BR", "en"]).optional(),
});

export type SignupResult =
  | { ok: true }
  | { ok: false; status: number; error: string; field?: string };

async function sendConfirmation(userId: string, email: string, name: string | null, locale: string | null) {
  const url = authTokenUrl(await createAuthToken(userId, "VERIFY_EMAIL"), "VERIFY_EMAIL");
  await sendEmail({ to: email, ...verifyEmailMessage(url, name, locale) });
}

export async function registerSignup(body: unknown, context: { ip: string | null }): Promise<SignupResult> {
  if (!isSignupAvailable()) return { ok: false, status: 503, error: "Sign-up is not available right now." };

  // Every attempt counts against the IP — invalid ones too — before any other work.
  if (context.ip && !(await hitRateLimit("signup-ip", context.ip, SIGNUP_LIMITS.perIpPerHour, 3600))) {
    return { ok: false, status: 429, error: "Too many attempts from this connection. Try again in an hour." };
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, status: 400, error: issue?.message ?? "Invalid input", field: issue?.path[0]?.toString() };
  }
  const input = parsed.data;
  if (!(await verifyTurnstile(input.turnstileToken, context.ip))) {
    return { ok: false, status: 400, error: "We could not confirm you are not a robot. Reload the page and try again.", field: "turnstile" };
  }

  const email = normalizeEmail(input.email);
  const passwordError = validateNewPassword(input.password, email);
  if (passwordError) return { ok: false, status: 400, error: passwordError, field: "password" };
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, status: 400, error: "Enter a valid WhatsApp number with area code", field: "phone" };
  let document: ReturnType<typeof parseDocument> = null;
  if (input.document?.trim()) {
    document = parseDocument(input.document);
    if (!document) return { ok: false, status: 400, error: "Invalid CPF or CNPJ: check the digits", field: "document" };
  }

  // E-mails to one address are capped, whatever the outcome below.
  const mayEmail = await hitRateLimit("signup-email", email, SIGNUP_LIMITS.emailsPerAddressPerHour, 3600);
  const locale = input.locale ?? "pt-BR";

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, emailVerified: true, locale: true },
  });
  if (existing) {
    if (mayEmail) {
      try {
        if (existing.emailVerified) {
          const login = new URL("/login", getBaseUrl()).toString();
          const reset = new URL("/esqueci-senha", getBaseUrl()).toString();
          await sendEmail({ to: email, ...alreadyRegisteredMessage(login, reset, existing.locale ?? locale) });
        } else {
          await sendConfirmation(existing.id, email, existing.name, existing.locale ?? locale);
        }
      } catch (err) {
        console.error("[signup] Could not e-mail an existing address:", (err as Error).message);
      }
    }
    return { ok: true };
  }

  const now = new Date();
  // scrypt runs before the transaction so it is not held open while hashing.
  const passwordHash = await hashPassword(input.password);
  let userId: string;
  try {
    userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: input.name,
          passwordHash,
          termsVersion: LEGAL_VERSION,
          termsAcceptedAt: now,
          locale,
        },
      });
      await tx.workspace.create({
        data: {
          name: input.companyName,
          ownerId: user.id,
          status: "PENDING_APPROVAL",
          statusChangedAt: now,
          signupSource: "SELF_SIGNUP",
          companyName: input.companyName,
          contactPhone: phone,
          documentType: document?.type ?? null,
          documentNumber: document?.number ?? null,
          // Follows the platform default limit (set in the admin area).
          instagramAccountLimit: null,
          members: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      return user.id;
    });
  } catch (err) {
    // Two submissions racing on the same e-mail: the same answer as above.
    if ((err as { code?: string }).code === "P2002") return { ok: true };
    throw err;
  }

  if (mayEmail) {
    try {
      await sendConfirmation(userId, email, input.name, locale);
    } catch (err) {
      console.error("[signup] Could not send the confirmation e-mail:", (err as Error).message);
    }
  }
  return { ok: true };
}

/** "Resend the link": same generic answer whatever the address. */
export async function resendConfirmation(rawEmail: unknown, context: { ip: string | null }): Promise<SignupResult> {
  const email = typeof rawEmail === "string" ? normalizeEmail(rawEmail) : "";
  if (!email.includes("@") || email.length > 200) return { ok: false, status: 400, error: "Enter a valid e-mail", field: "email" };
  if (context.ip && !(await hitRateLimit("signup-ip", context.ip, SIGNUP_LIMITS.perIpPerHour, 3600))) {
    return { ok: false, status: 429, error: "Too many attempts from this connection. Try again in an hour." };
  }
  if (!(await hitRateLimit("signup-email", email, SIGNUP_LIMITS.emailsPerAddressPerHour, 3600))) return { ok: true };
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, emailVerified: true, locale: true } });
  if (user && !user.emailVerified) {
    try {
      await sendConfirmation(user.id, email, user.name, user.locale);
    } catch (err) {
      console.error("[signup] Could not resend the confirmation:", (err as Error).message);
    }
  }
  return { ok: true };
}

/** Confirmation link: confirm, then tell the admins about the new sign-up (once). */
export async function confirmSignupEmail(token: string | null | undefined): Promise<boolean> {
  const result = await confirmEmailWithToken(token);
  if (!result.ok) return false;
  if (result.firstConfirmation) {
    await notifyAdminsOfSignup(result.userId).catch((err) =>
      console.error("[signup] Could not notify the admins:", (err as Error).message)
    );
  }
  return true;
}

export async function notifyAdminsOfSignup(userId: string): Promise<void> {
  const admins = getAdminEmails();
  if (!admins.length) return;
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, role: "OWNER", workspace: { status: "PENDING_APPROVAL" } },
    include: { workspace: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!membership?.user.email) return;
  const ws = membership.workspace;
  const url = new URL(`/admin/clients/${ws.id}`, getBaseUrl()).toString();
  const message = adminNewSignupMessage(
    {
      name: membership.user.name,
      email: membership.user.email,
      companyName: ws.companyName,
      phone: ws.contactPhone,
      document: ws.documentType && ws.documentNumber ? `${ws.documentType} ${formatDocument(ws.documentType, ws.documentNumber)}` : null,
    },
    url
  );
  for (const to of admins) await sendEmail({ to, ...message });
}

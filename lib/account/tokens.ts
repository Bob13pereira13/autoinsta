import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { hashPassword, validateNewPassword } from "@/lib/account/password";
import { sendEmail } from "@/lib/email/send";
import { passwordResetEmail, welcomeEmail } from "@/lib/email/templates";
import type { AuthTokenPurpose } from "@/app/generated/prisma/client";

const HOUR_MS = 60 * 60 * 1000;
export const AUTH_TOKEN_TTL_MS: Record<AuthTokenPurpose, number> = {
  WELCOME: 7 * 24 * HOUR_MS,
  RESET: HOUR_MS,
  VERIFY_EMAIL: 48 * HOUR_MS,
};
/** Minimum gap between two reset e-mails for the same account. */
const RESET_EMAIL_COOLDOWN_MS = 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAuthToken(userId: string, purpose: AuthTokenPurpose): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    // Only the newest link of each kind works.
    prisma.authToken.deleteMany({ where: { userId, purpose, usedAt: null } }),
    prisma.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL_MS[purpose]),
      },
    }),
  ]);
  return token;
}

export function authTokenUrl(token: string, purpose: AuthTokenPurpose): string {
  if (purpose === "VERIFY_EMAIL") {
    const confirm = new URL("/confirmar-email", getBaseUrl());
    confirm.searchParams.set("token", token);
    return confirm.toString();
  }
  const url = new URL("/redefinir-senha", getBaseUrl());
  url.searchParams.set("token", token);
  if (purpose === "WELCOME") url.searchParams.set("boas-vindas", "1");
  return url.toString();
}

export async function findValidAuthToken(token: string | null | undefined) {
  if (!token || token.length > 200) return null;
  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, disabledAt: true } } },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date() || record.user.disabledAt) {
    return null;
  }
  return record;
}

export type SetPasswordResult = { ok: true; email: string | null } | { ok: false; error: string };

export async function setPasswordWithToken(token: string, password: unknown): Promise<SetPasswordResult> {
  const record = await findValidAuthToken(token);
  // A sign-up confirmation link only confirms the address; it never sets a password.
  if (!record || (record.purpose !== "WELCOME" && record.purpose !== "RESET")) {
    return { ok: false, error: "This link is invalid, expired or was already used. Request a new one." };
  }
  const invalid = validateNewPassword(password, record.user.email);
  if (invalid) return { ok: false, error: invalid };

  const now = new Date();
  const passwordHash = await hashPassword(password as string);
  const used = await prisma.authToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: now },
  });
  // Lost a race with another tab using the same link.
  if (used.count === 0) {
    return { ok: false, error: "This link was already used. Request a new one." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        passwordChangedAt: now,
        // Opening a link sent to the address proves the user controls it.
        emailVerified: now,
      },
    }),
    prisma.authToken.deleteMany({ where: { userId: record.userId, usedAt: null } }),
  ]);

  return { ok: true, email: record.user.email };
}

export async function sendWelcomeEmail(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.email) throw new Error("User has no e-mail address");
  const url = authTokenUrl(await createAuthToken(userId, "WELCOME"), "WELCOME");
  const message = welcomeEmail(url, user.name);
  await sendEmail({ to: user.email, ...message });
  return url;
}

/**
 * Sends a reset link if the account exists and is active. Callers must show
 * the same message either way, so the form does not reveal which e-mails
 * have accounts.
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!email.includes("@")) return;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, disabledAt: true },
  });
  if (!user || user.disabledAt) return;

  const recent = await prisma.authToken.findFirst({
    where: {
      userId: user.id,
      purpose: "RESET",
      createdAt: { gt: new Date(Date.now() - RESET_EMAIL_COOLDOWN_MS) },
    },
  });
  if (recent) return;

  const url = authTokenUrl(await createAuthToken(user.id, "RESET"), "RESET");
  try {
    await sendEmail({ to: email, ...passwordResetEmail(url) });
  } catch (err) {
    console.error("[password-reset] Could not send e-mail:", err);
  }
}

export type ConfirmEmailResult =
  | { ok: true; userId: string; email: string | null; firstConfirmation: boolean }
  | { ok: false };

/**
 * Sign-up confirmation link: marks the address as confirmed. Returns whether
 * this was the first confirmation, so the admins are told about a new sign-up
 * only once.
 */
export async function confirmEmailWithToken(token: string | null | undefined): Promise<ConfirmEmailResult> {
  const record = await findValidAuthToken(token);
  if (!record || record.purpose !== "VERIFY_EMAIL") return { ok: false };
  const used = await prisma.authToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count === 0) return { ok: false };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: record.userId }, select: { emailVerified: true } });
  if (!user.emailVerified) {
    await prisma.user.update({ where: { id: record.userId }, data: { emailVerified: new Date() } });
  }
  return { ok: true, userId: record.userId, email: record.user.email, firstConfirmation: !user.emailVerified };
}

import { prisma } from "@/lib/db/client";
import { isEmailAllowedToSignIn } from "@/lib/env";
import { normalizeEmail } from "@/lib/account/tokens";

/**
 * Closed sign-up: accounts are created by the operator (npm run user -- create).
 * A magic link is only sent to an existing, active user or to someone with a
 * pending invitation to a workspace. ALLOWED_EMAILS, when set, still applies.
 */
export async function canReceiveMagicLink(rawEmail: string | null | undefined): Promise<boolean> {
  if (!rawEmail) return false;
  const email = normalizeEmail(rawEmail);
  if (!isEmailAllowedToSignIn(email)) return false;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { disabledAt: true },
  });
  if (user) return !user.disabledAt;

  const invitation = await prisma.workspaceInvitation.findFirst({
    where: { email, status: "PENDING", expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return Boolean(invitation);
}

/** Session check run on every request (see the jwt callback in lib/auth.ts). */
export async function isSessionStillValid(userId: string, authenticatedAt: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, disabledAt: true, passwordChangedAt: true },
  });
  if (!user || user.disabledAt) return null;
  // A password change signs out every session opened before it.
  if (user.passwordChangedAt && user.passwordChangedAt.getTime() > authenticatedAt) return null;
  return user;
}

/** The user's client (primary workspace) is DISABLED: no sign-in at all. */
export async function isClientDisabled(rawEmail: string | null | undefined): Promise<boolean> {
  if (!rawEmail) return false;
  const membership = await prisma.workspaceMember.findFirst({
    where: { user: { email: normalizeEmail(rawEmail) } },
    select: { workspace: { select: { status: true } } },
    orderBy: { createdAt: "asc" },
  });
  return membership?.workspace.status === "DISABLED";
}

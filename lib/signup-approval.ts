import { prisma } from "@/lib/db/client";

/**
 * Whether public sign-ups wait for an admin's approval.
 *
 * Off (the default): a sign-up becomes ACTIVE as soon as its e-mail is
 * confirmed. On: it stays PENDING_APPROVAL until an admin approves or rejects
 * it. A sign-up only skips approval when approval was off both when it was
 * made and when its e-mail is confirmed (see Workspace.signupAutoActivate), so
 * turning approval on also holds back sign-ups that are still unconfirmed.
 */
export async function getRequireSignupApproval(): Promise<boolean> {
  const settings = await prisma.platformSettings.findUnique({
    where: { id: "default" },
    select: { requireSignupApproval: true },
  });
  return settings?.requireSignupApproval ?? false;
}

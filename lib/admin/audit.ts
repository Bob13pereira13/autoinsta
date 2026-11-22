import { createHash } from "crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { normalizeEmail } from "@/lib/account/tokens";

/** SHA-256 of the normalized e-mail: kept in the audit after personal data is purged. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

export type AdminAction =
  | "client.approve"
  | "client.reject"
  | "client.activate"
  | "client.deactivate"
  | "client.limit"
  | "client.notes"
  | "client.create"
  | "account.toggle"
  | "account.remove"
  | "settings.price"
  | "settings.defaultLimit";

/** Record an admin action in the same transaction as the change itself. */
export async function recordAdminAction(
  tx: Prisma.TransactionClient,
  entry: {
    actorEmail: string;
    action: AdminAction;
    workspaceId?: string | null;
    subjectEmail?: string | null;
    before?: Prisma.InputJsonValue | null;
    after?: Prisma.InputJsonValue | null;
    reason?: string | null;
  }
) {
  await tx.adminAuditLog.create({
    data: {
      actorEmail: entry.actorEmail,
      action: entry.action,
      workspaceId: entry.workspaceId ?? null,
      subjectEmailHash: entry.subjectEmail ? hashEmail(entry.subjectEmail) : null,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      reason: entry.reason ?? null,
    },
  });
}

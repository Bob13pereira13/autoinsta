import type { Prisma, WorkspaceStatus } from "@/app/generated/prisma/client";

/**
 * Client (workspace) status. Only ACTIVE workspaces reach the dashboard APIs
 * and fire automations; PENDING_APPROVAL, REJECTED and DISABLED clients can
 * sign in only to read a status screen (DISABLED is turned away at sign-in).
 */
export const WORKSPACE_STATUSES = ["PENDING_APPROVAL", "ACTIVE", "DISABLED", "REJECTED"] as const satisfies readonly WorkspaceStatus[];

export function isActiveStatus(status: WorkspaceStatus | null | undefined): boolean {
  return status === "ACTIVE";
}

/** Rejected sign-ups' personal data is deleted this long after the decision. */
export const REJECTED_RETENTION_DAYS = 30;
/** Sign-ups whose e-mail was never confirmed are deleted after this long. */
export const UNCONFIRMED_SIGNUP_RETENTION_DAYS = 7;

/**
 * The fields to write when a workspace changes status. Becoming ACTIVE
 * (approval or reactivation) stamps automationsResumedAt, so the comment
 * reconciler never answers what was posted while the client could not use
 * the product. Instagram accounts' own switches are never touched.
 */
export function statusChange(
  from: WorkspaceStatus,
  to: WorkspaceStatus,
  extra: { reason?: string | null; now?: Date } = {}
): Prisma.WorkspaceUpdateInput {
  const now = extra.now ?? new Date();
  const data: Prisma.WorkspaceUpdateInput = { status: to, statusChangedAt: now };
  if (to === "ACTIVE" && from !== "ACTIVE") {
    data.automationsResumedAt = now;
    if (from === "PENDING_APPROVAL" || from === "REJECTED") data.approvedAt = now;
    data.rejectedAt = null;
    data.rejectionReason = null;
  }
  if (to === "REJECTED") {
    data.rejectedAt = now;
    data.rejectionReason = extra.reason ?? null;
  }
  return data;
}

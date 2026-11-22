import type { Prisma, WorkspaceStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { normalizeEmail, sendWelcomeEmail } from "@/lib/account/tokens";
import { recordAdminAction } from "@/lib/admin/audit";
import { sendEmail } from "@/lib/email/send";
import { approvedMessage, rejectedMessage } from "@/lib/email/account-emails";
import { removeInstagramAccounts } from "@/lib/instagram/remove-account";
import { parseDocument } from "@/lib/validation/document";
import { normalizePhone } from "@/lib/validation/phone";
import { statusChange } from "@/lib/workspace-status";

/**
 * Admin area operations. Each change and its audit entry are written in one
 * transaction; e-mails go out after the commit (best effort, logged).
 */

export class AdminError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "AdminError";
  }
}

export const DEFAULT_PRICE_CENTS = 19900;
export const MAX_ACCOUNT_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function getPlatformPriceCents(): Promise<number> {
  const settings = await prisma.platformSettings.findUnique({ where: { id: "default" } });
  return settings?.pricePerAccountCents ?? DEFAULT_PRICE_CENTS;
}

async function ownerOf(workspaceId: string) {
  const owner = await prisma.workspaceMember.findFirst({
    where: { workspaceId, role: "OWNER" },
    include: { user: { select: { id: true, name: true, email: true, locale: true, emailVerified: true } } },
    orderBy: { createdAt: "asc" },
  });
  return owner?.user ?? null;
}

/* -------------------------------- overview -------------------------------- */

export async function adminOverview(now = new Date()) {
  const [byStatus, accountsTotal, accountsOn, activeClientAccounts, activeClientAccountsOn, newSignups, activeClients, price, pending] =
    await Promise.all([
      prisma.workspace.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.instagramAccount.count(),
      prisma.instagramAccount.count({ where: { automationsEnabled: true } }),
      prisma.instagramAccount.count({ where: { workspace: { status: "ACTIVE" } } }),
      prisma.instagramAccount.count({ where: { automationsEnabled: true, workspace: { status: "ACTIVE" } } }),
      prisma.workspace.count({
        where: { signupSource: "SELF_SIGNUP", createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) }, owner: { emailVerified: { not: null } } },
      }),
      prisma.workspace.findMany({ where: { status: "ACTIVE" }, select: { instagramAccountLimit: true, pricePerAccountCents: true } }),
      getPlatformPriceCents(),
      prisma.workspace.findMany({
        // Only sign-ups whose e-mail was confirmed wait for a decision.
        where: { status: "PENDING_APPROVAL", owner: { emailVerified: { not: null } } },
        orderBy: { createdAt: "asc" },
        take: 50,
        select: {
          id: true,
          name: true,
          companyName: true,
          contactPhone: true,
          createdAt: true,
          owner: { select: { name: true, email: true } },
        },
      }),
    ]);

  const clientsByStatus: Record<WorkspaceStatus, number> = { PENDING_APPROVAL: 0, ACTIVE: 0, DISABLED: 0, REJECTED: 0 };
  for (const row of byStatus) clientsByStatus[row.status] = row._count._all;

  // Estimated monthly revenue: each ACTIVE client's account limit times its
  // price (or the platform price). Connected and switched-on accounts are
  // shown next to it, for information only.
  const estimatedRevenueCents = activeClients.reduce(
    (sum, ws) => sum + ws.instagramAccountLimit * (ws.pricePerAccountCents ?? price),
    0
  );

  return {
    clientsByStatus,
    accounts: { connected: accountsTotal, switchedOn: accountsOn },
    activeClientAccounts: { connected: activeClientAccounts, switchedOn: activeClientAccountsOn },
    newSignupsLast30Days: newSignups,
    pricePerAccountCents: price,
    estimatedRevenueCents,
    billableAccounts: activeClients.reduce((sum, ws) => sum + ws.instagramAccountLimit, 0),
    pending,
  };
}

/* ---------------------------------- list ---------------------------------- */

export async function listClients({ q, status, page = 1 }: { q?: string | null; status?: string | null; page?: number }) {
  const take = 25;
  const statusFilter = status && ["PENDING_APPROVAL", "ACTIVE", "DISABLED", "REJECTED"].includes(status) ? (status as WorkspaceStatus) : undefined;
  const term = q?.trim();
  const digits = term?.replace(/\D/g, "");
  const where: Prisma.WorkspaceWhereInput = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(term
      ? {
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { companyName: { contains: term, mode: "insensitive" } },
            { owner: { email: { contains: term, mode: "insensitive" } } },
            { owner: { name: { contains: term, mode: "insensitive" } } },
            { documentNumber: { contains: term.replace(/[\s.\-/]/g, "").toUpperCase() } },
            ...(digits && digits.length >= 4 ? [{ contactPhone: { contains: digits } }] : []),
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.workspace.count({ where }),
    prisma.workspace.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (Math.max(1, page) - 1) * take,
      take,
      select: {
        id: true,
        name: true,
        companyName: true,
        status: true,
        signupSource: true,
        instagramAccountLimit: true,
        rejectedAt: true,
        createdAt: true,
        owner: { select: { name: true, email: true, emailVerified: true } },
        _count: { select: { instagramAccounts: true, automations: true } },
      },
    }),
  ]);
  return { total, page: Math.max(1, page), pageSize: take, rows };
}

/* --------------------------------- detail --------------------------------- */

export async function getClientDetail(workspaceId: string, now = new Date()) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true, email: true, emailVerified: true, termsVersion: true, termsAcceptedAt: true, createdAt: true } },
        },
      },
      instagramAccounts: {
        orderBy: { connectedAt: "asc" },
        select: { id: true, username: true, automationsEnabled: true, tokenInvalidAt: true, connectedAt: true, _count: { select: { automations: true } } },
      },
      adminAuditLogs: { orderBy: { createdAt: "desc" }, take: 100 },
      _count: { select: { automations: true } },
    },
  });
  if (!workspace) return null;
  const sendsLast30Days = await prisma.dmLog.count({
    where: { workspaceId, status: "SENT", dmSentAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
  });
  return { workspace, sendsLast30Days, platformPriceCents: await getPlatformPriceCents() };
}

/* --------------------------------- status --------------------------------- */

export type StatusAction = "approve" | "reject" | "activate" | "deactivate";

const TRANSITIONS: Record<StatusAction, { from: WorkspaceStatus[]; to: WorkspaceStatus }> = {
  approve: { from: ["PENDING_APPROVAL", "REJECTED"], to: "ACTIVE" },
  reject: { from: ["PENDING_APPROVAL"], to: "REJECTED" },
  activate: { from: ["DISABLED"], to: "ACTIVE" },
  deactivate: { from: ["ACTIVE"], to: "DISABLED" },
};

const ACTION_LOG = {
  approve: "client.approve",
  reject: "client.reject",
  activate: "client.activate",
  deactivate: "client.deactivate",
} as const;

/**
 * Approve, reject (reason required, e-mailed), activate or deactivate a
 * client. Only the workspace status changes: Instagram accounts keep their
 * own switches, and nothing is deleted.
 */
export async function setClientStatus(actorEmail: string, workspaceId: string, action: StatusAction, rawReason?: string | null) {
  const rule = TRANSITIONS[action];
  if (!rule) throw new AdminError("Unknown action");
  const reason = rawReason?.trim() || null;
  if (action === "reject" && (!reason || reason.length < 3)) throw new AdminError("Write the reason for the rejection");
  if (reason && reason.length > 1000) throw new AdminError("The reason can have at most 1000 characters");

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, status: true } });
  if (!workspace) throw new AdminError("Client not found", 404);
  if (!rule.from.includes(workspace.status)) throw new AdminError("This action is not available for the client's current status", 409);
  const owner = await ownerOf(workspaceId);

  const updated = await prisma.$transaction(async (tx) => {
    // Guarded on the current status, so two admins clicking at once cannot both apply.
    const changed = await tx.workspace.updateMany({
      where: { id: workspaceId, status: workspace.status },
      data: statusChange(workspace.status, rule.to, { reason }) as Prisma.WorkspaceUpdateManyMutationInput,
    });
    if (changed.count === 0) throw new AdminError("The client changed in the meantime. Reload the page.", 409);
    await recordAdminAction(tx, {
      actorEmail,
      action: ACTION_LOG[action],
      workspaceId,
      subjectEmail: owner?.email,
      before: { status: workspace.status },
      after: { status: rule.to },
      reason,
    });
    return tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  });

  if (owner?.email) {
    try {
      if (action === "approve") {
        await sendEmail({ to: owner.email, ...approvedMessage(new URL("/login", getBaseUrl()).toString(), owner.name, owner.locale) });
      } else if (action === "reject") {
        await sendEmail({ to: owner.email, ...rejectedMessage(reason!, owner.name, owner.locale) });
      }
    } catch (err) {
      console.error(`[admin] Could not send the ${action} e-mail:`, (err as Error).message);
    }
  }
  return updated;
}

/* ------------------------------ limit / notes ----------------------------- */

export async function updateClient(
  actorEmail: string,
  workspaceId: string,
  changes: { instagramAccountLimit?: number; internalNotes?: string | null }
) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, instagramAccountLimit: true, internalNotes: true },
  });
  if (!workspace) throw new AdminError("Client not found", 404);
  const owner = await ownerOf(workspaceId);
  const data: Prisma.WorkspaceUpdateInput = {};
  if (changes.instagramAccountLimit !== undefined) {
    const limit = changes.instagramAccountLimit;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ACCOUNT_LIMIT) {
      throw new AdminError(`The limit must be between 1 and ${MAX_ACCOUNT_LIMIT}`);
    }
    if (limit !== workspace.instagramAccountLimit) data.instagramAccountLimit = limit;
  }
  if (changes.internalNotes !== undefined) {
    const notes = changes.internalNotes?.trim() || null;
    if (notes && notes.length > 5000) throw new AdminError("Notes can have at most 5000 characters");
    if (notes !== workspace.internalNotes) data.internalNotes = notes;
  }
  if (Object.keys(data).length === 0) return prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.workspace.update({ where: { id: workspaceId }, data });
    if (data.instagramAccountLimit !== undefined) {
      await recordAdminAction(tx, {
        actorEmail,
        action: "client.limit",
        workspaceId,
        subjectEmail: owner?.email,
        before: { instagramAccountLimit: workspace.instagramAccountLimit },
        after: { instagramAccountLimit: updated.instagramAccountLimit },
      });
    }
    if (data.internalNotes !== undefined) {
      await recordAdminAction(tx, {
        actorEmail,
        action: "client.notes",
        workspaceId,
        subjectEmail: owner?.email,
        before: { internalNotes: workspace.internalNotes },
        after: { internalNotes: updated.internalNotes },
      });
    }
    return updated;
  });
}

/* --------------------------------- accounts -------------------------------- */

export async function adminSetAccountEnabled(actorEmail: string, workspaceId: string, accountId: string, enabled: boolean) {
  const account = await prisma.instagramAccount.findFirst({
    where: { id: accountId, workspaceId },
    select: { id: true, username: true, automationsEnabled: true },
  });
  if (!account) throw new AdminError("Instagram account not found", 404);
  const owner = await ownerOf(workspaceId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.instagramAccount.update({
      where: { id: accountId },
      data: {
        automationsEnabled: enabled,
        ...(enabled && !account.automationsEnabled ? { automationsResumedAt: new Date() } : {}),
      },
      select: { id: true, automationsEnabled: true },
    });
    await recordAdminAction(tx, {
      actorEmail,
      action: "account.toggle",
      workspaceId,
      subjectEmail: owner?.email,
      before: { account: account.username, automationsEnabled: account.automationsEnabled },
      after: { account: account.username, automationsEnabled: enabled },
    });
    return updated;
  });
}

export async function adminRemoveAccount(actorEmail: string, workspaceId: string, accountId: string) {
  const account = await prisma.instagramAccount.findFirst({
    where: { id: accountId, workspaceId },
    select: { id: true, username: true, _count: { select: { automations: true } } },
  });
  if (!account) throw new AdminError("Instagram account not found", 404);
  const owner = await ownerOf(workspaceId);
  await prisma.$transaction(async (tx) => {
    await recordAdminAction(tx, {
      actorEmail,
      action: "account.remove",
      workspaceId,
      subjectEmail: owner?.email,
      before: { account: account.username, automations: account._count.automations },
      after: null,
    });
  });
  // Same removal as the Accounts tab (cascades, media files, bot bookkeeping).
  await removeInstagramAccounts(workspaceId, [accountId]);
}

/* --------------------------------- create --------------------------------- */

export async function createClient(
  actorEmail: string,
  input: { name: string; email: string; companyName: string; phone?: string | null; document?: string | null; instagramAccountLimit?: number }
) {
  const email = normalizeEmail(input.email ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new AdminError("Enter a valid e-mail");
  const name = input.name?.trim();
  const companyName = input.companyName?.trim();
  if (!name || name.length < 2) throw new AdminError("Enter your name");
  if (!companyName || companyName.length < 2) throw new AdminError("Enter the company name");
  const phone = input.phone?.trim() ? normalizePhone(input.phone) : null;
  if (input.phone?.trim() && !phone) throw new AdminError("Enter a valid WhatsApp number with area code");
  const document = input.document?.trim() ? parseDocument(input.document) : null;
  if (input.document?.trim() && !document) throw new AdminError("Invalid CPF or CNPJ: check the digits");
  const limit = input.instagramAccountLimit ?? 1;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ACCOUNT_LIMIT) throw new AdminError(`The limit must be between 1 and ${MAX_ACCOUNT_LIMIT}`);
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new AdminError("This e-mail already has an account", 409);
  }

  const now = new Date();
  const { userId, workspaceId } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, name } });
    const workspace = await tx.workspace.create({
      data: {
        name: companyName,
        ownerId: user.id,
        status: "ACTIVE",
        statusChangedAt: now,
        approvedAt: now,
        automationsResumedAt: now,
        signupSource: "ADMIN",
        companyName,
        contactPhone: phone,
        documentType: document?.type ?? null,
        documentNumber: document?.number ?? null,
        instagramAccountLimit: limit,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    await recordAdminAction(tx, {
      actorEmail,
      action: "client.create",
      workspaceId: workspace.id,
      subjectEmail: email,
      before: null,
      after: { status: "ACTIVE", companyName, instagramAccountLimit: limit },
    });
    return { userId: user.id, workspaceId: workspace.id };
  });

  // The invitation is the existing "set your password" link (valid 7 days);
  // using it also confirms the e-mail.
  let invited = true;
  try {
    await sendWelcomeEmail(userId);
  } catch (err) {
    invited = false;
    console.error("[admin] Could not send the invitation:", (err as Error).message);
  }
  return { workspaceId, invited };
}

/* -------------------------------- settings -------------------------------- */

export async function setPlatformPrice(actorEmail: string, cents: number) {
  if (!Number.isInteger(cents) || cents < 0 || cents > 100_000_000) throw new AdminError("Enter a valid price");
  const before = await getPlatformPriceCents();
  return prisma.$transaction(async (tx) => {
    const settings = await tx.platformSettings.upsert({
      where: { id: "default" },
      create: { id: "default", pricePerAccountCents: cents, updatedBy: actorEmail },
      update: { pricePerAccountCents: cents, updatedBy: actorEmail },
    });
    await recordAdminAction(tx, {
      actorEmail,
      action: "settings.price",
      before: { pricePerAccountCents: before },
      after: { pricePerAccountCents: cents },
    });
    return settings;
  });
}

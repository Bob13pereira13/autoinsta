/**
 * Admin area on a real Postgres: access (403), client status actions with the
 * audit log, the worker with a disabled client, limits, notes, manual client
 * creation, the price and the estimated revenue.
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const m = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
  session: null as null | { user: { id: string; email: string } },
  sendEmail: vi.fn(),
  meta: {
    sendPrivateReply: vi.fn(),
    sendPrivateReplyWithButton: vi.fn(),
    sendPrivateReplyWithLinkButton: vi.fn(),
    sendDirectMessage: vi.fn(),
    sendDirectMessageWithButton: vi.fn(),
    sendDirectMessageWithLinkButton: vi.fn(),
    sendDirectAttachment: vi.fn(),
    sendCommentReply: vi.fn(),
    getUserFollowStatus: vi.fn(),
    getUserUsername: vi.fn(),
  },
}));
vi.mock("@/lib/db/client", () => ({ get prisma() { return m.db; } }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.sendEmail, getEmailFrom: () => "test@app.test" }));
vi.mock("@/lib/auth", () => ({ auth: async () => m.session }));
vi.mock("@/lib/meta/client", () => ({
  ...m.meta,
  MetaApiError: class MetaApiError extends Error { code = 0; },
  TokenExpiredError: class TokenExpiredError extends Error {},
  RateLimitError: class RateLimitError extends Error {},
  PermissionError: class PermissionError extends Error {},
}));
vi.mock("@/lib/meta/oauth", () => ({ decryptToken: () => "token" }));
vi.mock("@/lib/utils/rate-limiter", () => ({
  reserveDMSlot: vi.fn(async () => ({ allowed: true, reserved: true })),
  releaseDMSlot: vi.fn(),
  reserveSendSlots: vi.fn(async () => true),
  countSendCalls: vi.fn(),
}));
vi.mock("@/lib/automation/guards", () => ({
  claimReplyCooldown: vi.fn(async () => ({ allowed: true, release: vi.fn() })),
  isHumanConversationActive: vi.fn(async () => false),
  handleEcho: vi.fn(),
  recordBotMessage: vi.fn(),
}));
vi.mock("@/lib/billing/usage", () => ({
  reserveWorkspaceDMSend: vi.fn(async () => ({ allowed: true, periodStart: new Date(), limit: 1000 })),
  releaseWorkspaceDMReservation: vi.fn(),
}));
vi.mock("@/lib/ops/worker-health", () => ({ recordWorkerAlert: vi.fn() }));
vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({ add: vi.fn() }),
  getRedisConnection: vi.fn(),
  POSTBACK_JOB_NAME: "process-postback",
  FOLLOWUP_JOB_NAME: "process-followup",
  MESSAGE_JOB_NAME: "process-message",
  ECHO_JOB_NAME: "process-echo",
}));
vi.mock("bullmq", () => ({
  Worker: function (_n: string, processor: unknown) {
    (global as Record<string, unknown>).__adminProcessor = processor;
    return { on: vi.fn(), close: vi.fn() };
  },
  UnrecoverableError: class UnrecoverableError extends Error {},
}));

import { GET as overviewGet } from "../app/api/admin/overview/route";
import { GET as clientsGet, POST as clientsPost } from "../app/api/admin/clients/route";
import { GET as clientGet, PATCH as clientPatch } from "../app/api/admin/clients/[id]/route";
import { POST as statusPost } from "../app/api/admin/clients/[id]/status/route";
import { DELETE as accountDelete, PATCH as accountPatch } from "../app/api/admin/clients/[id]/accounts/[accountId]/route";
import { GET as settingsGet, PUT as settingsPut } from "../app/api/admin/settings/route";
import { hashEmail } from "../lib/admin/audit";
import { createDMWorker } from "../lib/queue/dm-worker";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `admin_${randomBytes(4).toString("hex")}`;
let sql: Client;
const ADMIN = "dono@plataforma.test";

const json = (body?: unknown) =>
  body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } };
const req = (url: string, method = "GET", body?: unknown) => new NextRequest(`https://app.test${url}`, { method, ...json(body) });
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });
const status = (id: string, action: string, reason?: string) =>
  statusPost(req(`/api/admin/clients/${id}/status`, "POST", { action, reason }), params({ id }));
const audit = (workspaceId: string) => m.db.adminAuditLog.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });

type Job = { name: string; data: Record<string, unknown>; id: string; attemptsMade: number };
let processor: (job: Job) => Promise<void>;
let seq = 0;
const commentJob = (): Job => ({
  name: "process-comment",
  id: `job_${++seq}`,
  attemptsMade: 0,
  data: { instagramAccountId: "ig_active_1", commentId: `c_${seq}`, commentText: "quero o LINK", commenterId: `person_${seq}`, commenterName: "ana", mediaId: "p1" },
});
const privateReplies = () =>
  m.meta.sendPrivateReply.mock.calls.length + m.meta.sendPrivateReplyWithButton.mock.calls.length + m.meta.sendPrivateReplyWithLinkButton.mock.calls.length;

describe.skipIf(!databaseUrl)("admin area", () => {
  beforeAll(async () => {
    vi.stubEnv("ADMIN_EMAILS", `${ADMIN}, socio@plataforma.test`);
    vi.stubEnv("NEXTAUTH_URL", "https://app.test");
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    }
    m.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });

    // A pending sign-up, an active client with two accounts (one switched off), a disabled client.
    await m.db.user.create({ data: { id: "u_pending", email: "pendente@loja.test", name: "Pendente", emailVerified: new Date(), locale: "pt-BR" } });
    await m.db.workspace.create({ data: { id: "w_pending", name: "Loja Pendente", ownerId: "u_pending", status: "PENDING_APPROVAL", signupSource: "SELF_SIGNUP", companyName: "Loja Pendente", contactPhone: "+5511999998888", members: { create: { userId: "u_pending", role: "OWNER" } } } });
    await m.db.user.create({ data: { id: "u_active", email: "ativo@loja.test", name: "Ativo", emailVerified: new Date() } });
    await m.db.workspace.create({ data: { id: "w_active", name: "Loja Ativa", ownerId: "u_active", instagramAccountLimit: 3, members: { create: { userId: "u_active", role: "OWNER" } } } });
    await m.db.instagramAccount.create({ data: { id: "acc_on", workspaceId: "w_active", instagramId: "ig_active_1", username: "ativa_um", accessToken: "x" } });
    await m.db.instagramAccount.create({ data: { id: "acc_off", workspaceId: "w_active", instagramId: "ig_active_2", username: "ativa_dois", accessToken: "x", automationsEnabled: false } });
    await m.db.automation.create({ data: { id: "auto_1", workspaceId: "w_active", instagramAccountId: "acc_on", name: "Link", keywords: ["LINK"], matchAnyPost: true, dmMessage: "Oi!" } });
    await m.db.user.create({ data: { id: "u_disabled", email: "desativado@loja.test", emailVerified: new Date() } });
    await m.db.workspace.create({ data: { id: "w_disabled", name: "Loja Off", ownerId: "u_disabled", status: "DISABLED", instagramAccountLimit: 2, pricePerAccountCents: 9900, members: { create: { userId: "u_disabled", role: "OWNER" } } } });

    createDMWorker();
    processor = (global as Record<string, unknown>).__adminProcessor as (job: Job) => Promise<void>;
  }, 60_000);

  afterAll(async () => {
    await m.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    m.session = { user: { id: "admin", email: ADMIN } };
    m.sendEmail.mockReset();
    m.sendEmail.mockResolvedValue(undefined);
    for (const fn of Object.values(m.meta)) {
      fn.mockReset();
      fn.mockResolvedValue({ recipient_id: "person", message_id: `bot_${Math.random()}` });
    }
  });

  describe("access", () => {
    const calls = () => [
      overviewGet(),
      clientsGet(req("/api/admin/clients")),
      clientsPost(req("/api/admin/clients", "POST", { name: "X", email: "x@y.test", companyName: "X" })),
      clientGet(req("/api/admin/clients/w_active"), params({ id: "w_active" })),
      clientPatch(req("/api/admin/clients/w_active", "PATCH", { instagramAccountLimit: 9 }), params({ id: "w_active" })),
      status("w_pending", "approve"),
      accountPatch(req("/api/admin/clients/w_active/accounts/acc_on", "PATCH", { automationsEnabled: false }), params({ id: "w_active", accountId: "acc_on" })),
      accountDelete(req("/api/admin/clients/w_active/accounts/acc_on", "DELETE"), params({ id: "w_active", accountId: "acc_on" })),
      settingsGet(),
      settingsPut(req("/api/admin/settings", "PUT", { pricePerAccountCents: 1 })),
    ];

    it("answers 403 to anyone not in ADMIN_EMAILS (and to nobody signed in), changing nothing", async () => {
      for (const session of [null, { user: { id: "u_active", email: "ativo@loja.test" } }]) {
        m.session = session;
        const responses = await Promise.all(calls());
        expect(responses.map((r) => r.status)).toEqual(Array(10).fill(403));
      }
      expect((await m.db.workspace.findUniqueOrThrow({ where: { id: "w_pending" } })).status).toBe("PENDING_APPROVAL");
      expect((await m.db.workspace.findUniqueOrThrow({ where: { id: "w_active" } })).instagramAccountLimit).toBe(3);
      expect(await m.db.instagramAccount.count({ where: { id: "acc_on" } })).toBe(1);
      expect(await m.db.adminAuditLog.count()).toBe(0);
    });

    it("lets the admin in, case-insensitively", async () => {
      m.session = { user: { id: "admin", email: "SOCIO@plataforma.test" } };
      expect((await overviewGet()).status).toBe(200);
    });
  });

  it("approving moves the client to ACTIVE, e-mails a welcome and is audited", async () => {
    const res = await status("w_pending", "approve");
    expect(res.status).toBe(200);
    const ws = await m.db.workspace.findUniqueOrThrow({ where: { id: "w_pending" } });
    expect(ws.status).toBe("ACTIVE");
    expect(ws.approvedAt).not.toBeNull();
    expect(ws.automationsResumedAt).not.toBeNull();
    expect(m.sendEmail).toHaveBeenCalledTimes(1);
    expect(m.sendEmail.mock.calls[0][0]).toMatchObject({ to: "pendente@loja.test", subject: "Sua conta foi aprovada" });
    const [entry] = await audit("w_pending");
    expect(entry).toMatchObject({
      actorEmail: ADMIN,
      action: "client.approve",
      before: { status: "PENDING_APPROVAL" },
      after: { status: "ACTIVE" },
      subjectEmailHash: hashEmail("pendente@loja.test"),
    });
    // Approving again is not available.
    expect((await status("w_pending", "approve")).status).toBe(409);
  });

  it("rejecting needs a reason, e-mails it and stores it in the client and the audit", async () => {
    await m.db.user.create({ data: { id: "u_rej", email: "recusar@loja.test", name: "Rê", emailVerified: new Date(), locale: "en" } });
    await m.db.workspace.create({ data: { id: "w_rej", name: "Rej", ownerId: "u_rej", status: "PENDING_APPROVAL", members: { create: { userId: "u_rej", role: "OWNER" } } } });
    expect((await status("w_rej", "reject")).status).toBe(400);
    expect((await status("w_rej", "reject", "Segmento não atendido")).status).toBe(200);
    const ws = await m.db.workspace.findUniqueOrThrow({ where: { id: "w_rej" } });
    expect(ws).toMatchObject({ status: "REJECTED", rejectionReason: "Segmento não atendido" });
    expect(m.sendEmail.mock.calls[0][0].to).toBe("recusar@loja.test");
    // The client chose English at sign-up.
    expect(m.sendEmail.mock.calls[0][0].subject).toBe("Your sign-up was not approved");
    expect(m.sendEmail.mock.calls[0][0].text).toContain("Segmento não atendido");
    expect((await audit("w_rej"))[0]).toMatchObject({ action: "client.reject", reason: "Segmento não atendido", after: { status: "REJECTED" } });
  });

  it("a disabled client fires nothing; reactivated it fires again and the accounts' switches are untouched", async () => {
    await processor(commentJob());
    expect(privateReplies()).toBe(1);

    expect((await status("w_active", "deactivate")).status).toBe(200);
    await processor(commentJob());
    await processor({ name: "process-message", id: "msg", attemptsMade: 0, data: { instagramAccountId: "ig_active_1", messageId: "mid_x", messageText: "LINK", senderId: "p", channel: "DIRECT" } });
    expect(privateReplies()).toBe(1);
    expect(m.meta.sendDirectMessage).not.toHaveBeenCalled();

    expect((await status("w_active", "activate")).status).toBe(200);
    await processor(commentJob());
    expect(privateReplies()).toBe(2);

    const accounts = await m.db.instagramAccount.findMany({ where: { workspaceId: "w_active" }, orderBy: { id: "asc" } });
    expect(accounts.map((a) => [a.id, a.automationsEnabled])).toEqual([["acc_off", false], ["acc_on", true]]);
    const ws = await m.db.workspace.findUniqueOrThrow({ where: { id: "w_active" } });
    expect(Date.now() - ws.automationsResumedAt!.getTime()).toBeLessThan(60_000);
    expect((await audit("w_active")).map((e) => e.action)).toEqual(["client.deactivate", "client.activate"]);
  });

  it("limit, notes and the accounts' switch and removal are audited with before and after", async () => {
    await clientPatch(req("/api/admin/clients/w_active", "PATCH", { instagramAccountLimit: 5, internalNotes: "Cliente VIP" }), params({ id: "w_active" }));
    expect((await clientPatch(req("/api/admin/clients/w_active", "PATCH", { instagramAccountLimit: 0 }), params({ id: "w_active" }))).status).toBe(400);
    await accountPatch(req("/api/admin/clients/w_active/accounts/acc_off", "PATCH", { automationsEnabled: true }), params({ id: "w_active", accountId: "acc_off" }));
    expect((await m.db.instagramAccount.findUniqueOrThrow({ where: { id: "acc_off" } })).automationsResumedAt).not.toBeNull();
    await accountDelete(req("/api/admin/clients/w_active/accounts/acc_off", "DELETE"), params({ id: "w_active", accountId: "acc_off" }));
    expect(await m.db.instagramAccount.count({ where: { id: "acc_off" } })).toBe(0);

    const entries = (await audit("w_active")).slice(2);
    expect(entries.map((e) => [e.action, e.before, e.after])).toEqual([
      ["client.limit", { instagramAccountLimit: 3 }, { instagramAccountLimit: 5 }],
      ["client.notes", { internalNotes: null }, { internalNotes: "Cliente VIP" }],
      ["account.toggle", { account: "ativa_dois", automationsEnabled: false }, { account: "ativa_dois", automationsEnabled: true }],
      ["account.remove", { account: "ativa_dois", automations: 0 }, null],
    ]);
    // The detail shows the audit and the 30-day sends.
    const detail = (await (await clientGet(req("/api/admin/clients/w_active"), params({ id: "w_active" }))).json()).data;
    expect(detail.workspace.adminAuditLogs).toHaveLength(6);
    expect(detail.sendsLast30Days).toBe(2);
  });

  it("creates a client by hand: ACTIVE, with an invitation e-mail, audited; a used e-mail is refused", async () => {
    const res = await clientsPost(req("/api/admin/clients", "POST", { name: "Nova Loja", email: "Nova@Loja.test", companyName: "Nova Loja LTDA", phone: "(21) 98888-7777", document: "11.222.333/0001-81", instagramAccountLimit: 2 }));
    expect(res.status).toBe(200);
    const { workspaceId, invited } = (await res.json()).data;
    expect(invited).toBe(true);
    const ws = await m.db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { owner: true } });
    expect(ws).toMatchObject({ status: "ACTIVE", signupSource: "ADMIN", instagramAccountLimit: 2, contactPhone: "+5521988887777", documentType: "CNPJ", documentNumber: "11222333000181" });
    expect(ws.owner.email).toBe("nova@loja.test");
    expect(m.sendEmail.mock.calls[0][0].to).toBe("nova@loja.test");
    expect(await m.db.authToken.count({ where: { userId: ws.ownerId, purpose: "WELCOME" } })).toBe(1);
    expect((await audit(workspaceId))[0]).toMatchObject({ action: "client.create", actorEmail: ADMIN });
    expect((await clientsPost(req("/api/admin/clients", "POST", { name: "Xavier", email: "nova@loja.test", companyName: "Outra Loja" }))).status).toBe(409);
    // Without a limit it follows the platform default.
    const plain = (await (await clientsPost(req("/api/admin/clients", "POST", { name: "Padrão", email: "padrao@loja.test", companyName: "Loja Padrão" }))).json()).data;
    expect((await m.db.workspace.findUniqueOrThrow({ where: { id: plain.workspaceId } })).instagramAccountLimit).toBeNull();
    await m.db.workspace.update({ where: { id: plain.workspaceId }, data: { status: "DISABLED" } });
  });

  it("estimated revenue, ACTIVE clients only: with a limit = limit × price; without = connected accounts × price", async () => {
    expect((await (await settingsGet()).json()).data).toEqual({ pricePerAccountCents: 19900, defaultInstagramAccountLimit: null, requireSignupApproval: false });
    await settingsPut(req("/api/admin/settings", "PUT", { pricePerAccountCents: 25000 }));
    expect(await m.db.adminAuditLog.count({ where: { action: "settings.price" } })).toBe(1);

    // A client without a limit (follows the "no limit" default), own price R$ 100, two accounts.
    await m.db.user.create({ data: { id: "u_unl", email: "semlimite@loja.test", emailVerified: new Date() } });
    await m.db.workspace.create({ data: { id: "w_unl", name: "Sem Limite LTDA", ownerId: "u_unl", pricePerAccountCents: 10000, members: { create: { userId: "u_unl", role: "OWNER" } } } });
    await m.db.instagramAccount.createMany({ data: [
      { id: "acc_u1", workspaceId: "w_unl", instagramId: "ig_u1", username: "u1", accessToken: "x" },
      { id: "acc_u2", workspaceId: "w_unl", instagramId: "ig_u2", username: "u2", accessToken: "x", automationsEnabled: false },
    ] });

    // ACTIVE now: w_pending (default, 0 accounts), w_active (own 5), Nova Loja (own 2), w_unl (default, 2 accounts).
    // w_disabled (own 2 × R$ 99) does not count.
    let data = (await (await overviewGet()).json()).data;
    expect(data.estimatedRevenueCents).toBe(0 * 25000 + 5 * 25000 + 2 * 25000 + 2 * 10000);
    expect(data.billableAccounts).toBe(0 + 5 + 2 + 2);
    expect([data.limitedClients, data.unlimitedClients, data.defaultAccountLimit]).toEqual([2, 2, null]);

    // A numeric default turns the clients that follow it into limited ones.
    await settingsPut(req("/api/admin/settings", "PUT", { defaultInstagramAccountLimit: 3 }));
    data = (await (await overviewGet()).json()).data;
    expect(data.estimatedRevenueCents).toBe(3 * 25000 + 5 * 25000 + 2 * 25000 + 3 * 10000);
    expect([data.limitedClients, data.unlimitedClients, data.defaultAccountLimit]).toEqual([4, 0, 3]);
    expect(await m.db.adminAuditLog.findFirst({ where: { action: "settings.defaultLimit" } })).toMatchObject({
      before: { defaultInstagramAccountLimit: null },
      after: { defaultInstagramAccountLimit: 3 },
    });
    // Back to "no limit".
    await settingsPut(req("/api/admin/settings", "PUT", { defaultInstagramAccountLimit: null }));
    expect((await (await settingsGet()).json()).data.defaultInstagramAccountLimit).toBeNull();
    expect((await settingsPut(req("/api/admin/settings", "PUT", { defaultInstagramAccountLimit: 0 }))).status).toBe(400);
  });

  it("a client goes back to following the default (null), audited, and the detail shows the limit in effect", async () => {
    await settingsPut(req("/api/admin/settings", "PUT", { defaultInstagramAccountLimit: 4 }));
    const res = await clientPatch(req("/api/admin/clients/w_active", "PATCH", { instagramAccountLimit: null }), params({ id: "w_active" }));
    expect(res.status).toBe(200);
    expect((await m.db.workspace.findUniqueOrThrow({ where: { id: "w_active" } })).instagramAccountLimit).toBeNull();
    const last = (await audit("w_active")).filter((e) => e.action === "client.limit").pop();
    expect([last?.before, last?.after]).toEqual([{ instagramAccountLimit: 5 }, { instagramAccountLimit: null }]);
    const detail = (await (await clientGet(req("/api/admin/clients/w_active"), params({ id: "w_active" }))).json()).data;
    expect(detail.accountLimit).toEqual({ own: null, platformDefault: 4, effective: 4 });
    await settingsPut(req("/api/admin/settings", "PUT", { defaultInstagramAccountLimit: null }));
  });

  it("lists and searches clients by status, company, e-mail and document", async () => {
    const list = async (query: string) => (await (await clientsGet(req(`/api/admin/clients${query}`))).json()).data;
    const disabled = (await list("?status=DISABLED")).rows as Array<{ id: string; status: string }>;
    expect(disabled.map((r) => r.id)).toContain("w_disabled");
    expect(disabled.every((r) => r.status === "DISABLED")).toBe(true);
    expect((await list("?q=nova")).total).toBe(1);
    expect((await list("?q=11.222.333/0001-81")).total).toBe(1);
    expect((await list("?q=PENDENTE@")).rows[0].id).toBe("w_pending");
  });
});

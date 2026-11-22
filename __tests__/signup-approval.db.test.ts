/**
 * Optional sign-up approval, on a real Postgres and the local Redis: with the
 * option off a confirmed sign-up is ACTIVE at once (welcome e-mail, admins
 * told, the worker fires); on, it waits for an admin. Every change of the
 * option is audited; deactivating a client works as before.
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
  userId: null as string | null,
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
vi.mock("@/lib/auth", () => ({
  auth: async () => m.session,
  getCurrentUserId: async () => m.userId,
  getCurrentWorkspaceId: async () => (m.userId ? (await import("../lib/workspace")).resolveActiveWorkspaceId(m.userId) : null),
}));
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
    (global as Record<string, unknown>).__approvalProcessor = processor;
    return { on: vi.fn(), close: vi.fn() };
  },
  UnrecoverableError: class UnrecoverableError extends Error {},
}));

import { POST as signupRoute } from "../app/api/signup/route";
import { GET as automationsGet } from "../app/api/automations/route";
import { GET as settingsGet, PUT as settingsPut } from "../app/api/admin/settings/route";
import { POST as statusPost } from "../app/api/admin/clients/[id]/status/route";
import { authorizeWithPassword } from "../lib/account/authorize";
import { confirmSignupEmail } from "../lib/account/signup";
import { hashEmail, SYSTEM_ACTOR } from "../lib/admin/audit";
import { listSettingsAudit } from "../lib/admin/clients";
import { createDMWorker } from "../lib/queue/dm-worker";
import { resolveActiveWorkspaceId } from "../lib/workspace";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `approval_${randomBytes(4).toString("hex")}`;
const run = randomBytes(3).toString("hex");
const ADMIN = "dono@plataforma.test";
const ADMINS = ["dono@plataforma.test", "socio@plataforma.test"];
let sql: Client;
let ipSeq = 0;
const freshIp = () => `198.19.${parseInt(run.slice(0, 2), 16)}.${(ipSeq += 1)}`;

type Job = { name: string; data: Record<string, unknown>; id: string; attemptsMade: number };
let processor: (job: Job) => Promise<void>;
let seq = 0;

const asAdmin = () => (m.session = { user: { id: "admin", email: ADMIN } });
const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const setApproval = (value: unknown) => settingsPut(new NextRequest("https://app.test/api/admin/settings", { method: "PUT", ...json({ requireSignupApproval: value }) }));
const setStatus = (id: string, action: string) =>
  statusPost(new NextRequest(`https://app.test/api/admin/clients/${id}/status`, { method: "POST", ...json({ action }) }), { params: Promise.resolve({ id }) });
const signupAuditCount = () => m.db.adminAuditLog.count({ where: { action: "settings.signupApproval" } });

async function signUp(email: string, companyName: string) {
  const res = await signupRoute(
    new NextRequest("https://app.test/api/signup", {
      method: "POST",
      ...json({ name: "Maria Souza", email, password: "senha-forte-2026", companyName, phone: "(11) 99999-8888", acceptTerms: true, locale: "pt-BR" }),
      headers: { "content-type": "application/json", "x-forwarded-for": freshIp() },
    })
  );
  expect(res.status).toBe(200);
  const mail = m.sendEmail.mock.calls.map((c) => c[0]).filter((e) => e.to === email).pop() as { text: string };
  const token = new URL(mail.text.match(/https:\/\/app\.test\/confirmar-email\?token=[^\s]+/)![0]).searchParams.get("token")!;
  const user = await m.db.user.findUniqueOrThrow({ where: { email } });
  const workspace = await m.db.workspace.findFirstOrThrow({ where: { ownerId: user.id } });
  return { token, user, workspace, confirmationText: mail.text };
}

/** Connects an Instagram account with a keyword automation, as the client would. */
async function connectInstagram(workspaceId: string, igId: string) {
  await m.db.instagramAccount.create({ data: { id: `acc_${igId}`, workspaceId, instagramId: igId, username: igId, accessToken: "x" } });
  await m.db.automation.create({
    data: { workspaceId, instagramAccountId: `acc_${igId}`, name: "Link", keywords: ["LINK"], matchAnyPost: true, dmMessage: "Oi!" },
  });
}
const comment = (igId: string): Job => ({
  name: "process-comment",
  id: `job_${++seq}`,
  attemptsMade: 0,
  data: { instagramAccountId: igId, commentId: `c_${run}_${seq}`, commentText: "quero o LINK", commenterId: `person_${seq}`, commenterName: "ana", mediaId: "p1" },
});
const privateReplies = () =>
  m.meta.sendPrivateReply.mock.calls.length + m.meta.sendPrivateReplyWithButton.mock.calls.length + m.meta.sendPrivateReplyWithLinkButton.mock.calls.length;
const mailsTo = (to: string) => m.sendEmail.mock.calls.map((c) => c[0]).filter((e) => e.to === to);

describe.skipIf(!databaseUrl)("optional sign-up approval", () => {
  beforeAll(async () => {
    vi.stubEnv("REDIS_URL", process.env.REDIS_URL ?? "redis://localhost:6379");
    vi.stubEnv("NEXTAUTH_URL", "https://app.test");
    vi.stubEnv("ADMIN_EMAILS", ADMINS.join(", "));
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    }
    m.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
    createDMWorker();
    processor = (global as Record<string, unknown>).__approvalProcessor as (job: Job) => Promise<void>;
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
    asAdmin();
    m.userId = null;
    m.sendEmail.mockReset();
    m.sendEmail.mockResolvedValue(undefined);
    for (const fn of Object.values(m.meta)) {
      fn.mockReset();
      fn.mockResolvedValue({ recipient_id: "person", message_id: `bot_${Math.random()}` });
    }
  });

  it("is off by default", async () => {
    const res = await settingsGet();
    expect((await res.json()).data.requireSignupApproval).toBe(false);
    expect(await signupAuditCount()).toBe(0);
  });

  it("off: the confirmed sign-up goes straight in — welcome e-mail at confirmation, admins told with the link, the worker fires", async () => {
    const email = `direto-${run}@loja.test`;
    const { token, user, workspace, confirmationText } = await signUp(email, "Loja Direta");
    // Until the e-mail is confirmed the workspace is not active.
    expect(workspace).toMatchObject({ status: "PENDING_APPROVAL", signupAutoActivate: true });
    expect(confirmationText).toContain("você já pode entrar e usar o painel");
    expect(confirmationText).not.toContain("nossa equipe analisa");

    m.sendEmail.mockClear();
    expect(await confirmSignupEmail(token)).toEqual({ ok: true, active: true });

    const ws = await m.db.workspace.findUniqueOrThrow({ where: { id: workspace.id } });
    expect(ws.status).toBe("ACTIVE");
    expect(ws.approvedAt).not.toBeNull();
    expect(ws.automationsResumedAt).not.toBeNull();

    // Welcome e-mail to the client, at the confirmation.
    const [welcome, ...more] = mailsTo(email);
    expect(more).toEqual([]);
    expect(welcome.subject).toBe("Sua conta está pronta");
    expect(welcome.text).toContain("https://app.test/login");
    // Each admin is told, with the link to the client.
    for (const admin of ADMINS) {
      const [notice] = mailsTo(admin);
      expect(notice.subject).toBe("Novo cliente cadastrado (já ativo): Loja Direta");
      expect(notice.text).toContain(`https://app.test/admin/clients/${workspace.id}`);
    }
    expect(m.sendEmail).toHaveBeenCalledTimes(3);

    // Audited as done by the system.
    const entries = await m.db.adminAuditLog.findMany({ where: { workspaceId: workspace.id } });
    expect(entries).toEqual([
      expect.objectContaining({
        actorEmail: SYSTEM_ACTOR,
        action: "client.autoActivate",
        before: { status: "PENDING_APPROVAL" },
        after: { status: "ACTIVE" },
        subjectEmailHash: hashEmail(email),
      }),
    ]);

    // Signs in and reaches the dashboard APIs.
    expect(await authorizeWithPassword({ email, password: "senha-forte-2026" })).toMatchObject({ email });
    m.userId = user.id;
    expect(await resolveActiveWorkspaceId(user.id)).toBe(workspace.id);
    expect((await automationsGet(new NextRequest("https://app.test/api/automations"))).status).toBe(200);

    // The worker answers comments for this client.
    await connectInstagram(workspace.id, `ig_direto_${run}`);
    await processor(comment(`ig_direto_${run}`));
    expect(privateReplies()).toBe(1);

    // The link works once; nothing is sent again.
    m.sendEmail.mockClear();
    expect(await confirmSignupEmail(token)).toEqual({ ok: false });
    expect(m.sendEmail).not.toHaveBeenCalled();
  });

  it("deactivating a client that came in without approval works as before", async () => {
    const ws = await m.db.workspace.findFirstOrThrow({ where: { owner: { email: `direto-${run}@loja.test` } } });
    expect((await setStatus(ws.id, "deactivate")).status).toBe(200);
    await processor(comment(`ig_direto_${run}`));
    expect(privateReplies()).toBe(0);
    expect(await authorizeWithPassword({ email: `direto-${run}@loja.test`, password: "senha-forte-2026" }).catch((e) => e.name)).toBe("AccountDisabledError");

    expect((await setStatus(ws.id, "activate")).status).toBe(200);
    await processor(comment(`ig_direto_${run}`));
    expect(privateReplies()).toBe(1);
  });

  it("on: the confirmed sign-up still waits for approval, the admins are told, and the worker stays quiet until it is approved", async () => {
    expect((await setApproval(true)).status).toBe(200);
    const email = `aprovar-${run}@loja.test`;
    const { token, workspace, confirmationText } = await signUp(email, "Loja Analisada");
    expect(workspace).toMatchObject({ status: "PENDING_APPROVAL", signupAutoActivate: false });
    expect(confirmationText).toContain("nossa equipe analisa");

    m.sendEmail.mockClear();
    expect(await confirmSignupEmail(token)).toEqual({ ok: true, active: false });
    expect((await m.db.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).status).toBe("PENDING_APPROVAL");
    // No welcome yet; each admin is told it is waiting, with the link.
    expect(mailsTo(email)).toEqual([]);
    for (const admin of ADMINS) {
      const [notice] = mailsTo(admin);
      expect(notice.subject).toBe("Novo cadastro aguardando aprovação: Loja Analisada");
      expect(notice.text).toContain(`https://app.test/admin/clients/${workspace.id}`);
    }
    expect(await m.db.adminAuditLog.count({ where: { workspaceId: workspace.id } })).toBe(0);

    await connectInstagram(workspace.id, `ig_aprovar_${run}`);
    await processor(comment(`ig_aprovar_${run}`));
    expect(privateReplies()).toBe(0);

    m.sendEmail.mockClear();
    expect((await setStatus(workspace.id, "approve")).status).toBe(200);
    expect(mailsTo(email)[0].subject).toBe("Sua conta foi aprovada");
    await processor(comment(`ig_aprovar_${run}`));
    expect(privateReplies()).toBe(1);
  });

  it("only sign-ups made and confirmed with approval off skip it; changing the option changes nobody's status", async () => {
    // Made while off, approval turned on before the confirmation: waits.
    expect((await setApproval(false)).status).toBe(200);
    const early = await signUp(`antes-${run}@loja.test`, "Antes");
    expect((await setApproval(true)).status).toBe(200);
    expect(await confirmSignupEmail(early.token)).toEqual({ ok: true, active: false });

    // Made while on, approval turned off before the confirmation: waits too.
    const late = await signUp(`depois-${run}@loja.test`, "Depois");
    expect((await setApproval(false)).status).toBe(200);
    m.sendEmail.mockClear();
    expect(await confirmSignupEmail(late.token)).toEqual({ ok: true, active: false });
    expect(mailsTo(ADMIN)[0].subject).toBe("Novo cadastro aguardando aprovação: Depois");

    const statuses = await m.db.workspace.findMany({ where: { id: { in: [early.workspace.id, late.workspace.id] } }, select: { status: true } });
    expect(statuses).toEqual([{ status: "PENDING_APPROVAL" }, { status: "PENDING_APPROVAL" }]);
  });

  it("every change of the option goes to the audit; the same value or bad input writes nothing; only admins may change it", async () => {
    expect((await setApproval(false)).status).toBe(200); // already off
    const start = await signupAuditCount();

    expect((await setApproval(true)).status).toBe(200);
    expect((await setApproval(true)).status).toBe(200); // no change, no entry
    expect((await setApproval("yes")).status).toBe(400);
    expect((await setApproval(null)).status).toBe(400);
    m.session = { user: { id: "u", email: "cliente@loja.test" } };
    expect((await setApproval(false)).status).toBe(403);
    asAdmin();
    m.session = { user: { id: "admin2", email: "socio@plataforma.test" } };
    expect((await setApproval(false)).status).toBe(200);

    const entries = await m.db.adminAuditLog.findMany({
      where: { action: "settings.signupApproval" },
      orderBy: { createdAt: "asc" },
      skip: start,
    });
    expect(entries.map((e) => ({ actor: e.actorEmail, before: e.before, after: e.after, workspaceId: e.workspaceId }))).toEqual([
      { actor: ADMIN, before: { requireSignupApproval: false }, after: { requireSignupApproval: true }, workspaceId: null },
      { actor: "socio@plataforma.test", before: { requireSignupApproval: true }, after: { requireSignupApproval: false }, workspaceId: null },
    ]);
    // The settings page lists them, newest first.
    const history = await listSettingsAudit();
    expect(history[0]).toMatchObject({ action: "settings.signupApproval", actorEmail: "socio@plataforma.test" });
    expect((await (await settingsGet()).json()).data.requireSignupApproval).toBe(false);
  });
});

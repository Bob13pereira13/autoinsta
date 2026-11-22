/**
 * The Accounts tab on a real Postgres: permissions, the Ativa/Desativada
 * switch (with the worker processing real jobs) and removal.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const m = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
  role: "OWNER" as "OWNER" | "ADMIN" | "MEMBER",
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
vi.mock("@/lib/workspace-access", () => ({
  getCurrentWorkspaceContext: async () => ({ userId: "u1", workspaceId: "w1", role: m.role }),
  canManageWorkspace: (role: string) => role === "OWNER" || role === "ADMIN",
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
    (global as Record<string, unknown>).__accountsProcessor = processor;
    return { on: vi.fn(), close: vi.fn() };
  },
  UnrecoverableError: class UnrecoverableError extends Error {},
}));

import { DELETE, GET, PATCH } from "../app/api/instagram/accounts/route";
import { POST as legacyDisconnect } from "../app/api/instagram/disconnect/route";
import { createDMWorker } from "../lib/queue/dm-worker";
import { storeUpload, resolveMediaPath } from "../lib/media/storage";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `accounts_${randomBytes(4).toString("hex")}`;
let sql: Client;
let uploads: string;

const req = (method: string, query: string, body?: unknown) =>
  new NextRequest(`https://app.test/api/instagram/accounts${query}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });

type Job = { name: string; data: Record<string, unknown>; id: string; attemptsMade: number };
let processor: (job: Job) => Promise<void>;
let seq = 0;
const commentJob = (mediaId = "p1"): Job => ({
  name: "process-comment",
  id: `job_${++seq}`,
  attemptsMade: 0,
  data: { instagramAccountId: "ig1", commentId: `c_${seq}`, commentText: "quero o LINK", commenterId: `person_${seq}`, commenterName: "ana", mediaId },
});
const messageJob = (): Job => ({
  name: "process-message",
  id: `job_${++seq}`,
  attemptsMade: 0,
  data: { instagramAccountId: "ig1", messageId: `mid_${seq}`, messageText: "qual o horario?", senderId: `person_${seq}`, channel: "DIRECT" },
});
// A private reply goes out as plain text, with a button or with a link button.
const privateReplies = () =>
  m.meta.sendPrivateReply.mock.calls.length +
  m.meta.sendPrivateReplyWithButton.mock.calls.length +
  m.meta.sendPrivateReplyWithLinkButton.mock.calls.length;
const sends = () =>
  Object.entries(m.meta)
    .filter(([name]) => name.startsWith("send"))
    .reduce((n, [, fn]) => n + fn.mock.calls.length, 0);

describe.skipIf(!databaseUrl)("Accounts tab", () => {
  beforeAll(async () => {
    uploads = mkdtempSync(path.join(tmpdir(), "uploads-accounts-"));
    vi.stubEnv("UPLOADS_DIR", uploads);
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
    await m.db.user.create({ data: { id: "u1", email: "o@x.test" } });
    await m.db.workspace.create({ data: { id: "w1", name: "W", ownerId: "u1" } });
    await m.db.workspace.create({ data: { id: "w2", name: "Other", ownerId: "u1" } });
    await m.db.instagramAccount.create({ data: { id: "acc1", workspaceId: "w1", instagramId: "ig1", username: "loja", accessToken: "enc" } });
    await m.db.instagramAccount.create({ data: { id: "acc2", workspaceId: "w1", instagramId: "ig2", username: "outra", accessToken: "enc" } });
    await m.db.instagramAccount.create({ data: { id: "foreign", workspaceId: "w2", instagramId: "ig9", username: "alheia", accessToken: "enc" } });
    const base = { workspaceId: "w1", instagramAccountId: "acc1", dmMessage: "Aqui: {link}" };
    // A Comments automation marked on two posts and a Direct one; one paused.
    await m.db.automation.create({
      data: { ...base, id: "comments", name: "Comentários", keywords: ["LINK"], postId: "p1",
        posts: { create: [{ postId: "p1", position: 0 }, { postId: "p2", position: 1 }] },
        trackedLinks: { create: [{ workspaceId: "w1", slug: "slug_acc1", destinationUrl: "https://loja.test" }] } },
    });
    await m.db.automation.create({ data: { ...base, id: "direct", name: "Direct", type: "DIRECT", keywords: ["horario"], dmMessage: "Das 9 às 18h" } });
    await m.db.automation.create({ data: { ...base, id: "paused", name: "Pausada", keywords: ["X"], matchAnyPost: true, isActive: false } });
    await m.db.automation.create({ data: { workspaceId: "w1", instagramAccountId: "acc2", id: "other_acc", name: "Outra conta", keywords: ["LINK"], matchAnyPost: true, dmMessage: "Oi" } });
    createDMWorker();
    processor = (global as Record<string, unknown>).__accountsProcessor as (job: Job) => Promise<void>;
  }, 60_000);

  afterAll(async () => {
    await m.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
    rmSync(uploads, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    m.role = "OWNER";
    for (const fn of Object.values(m.meta)) {
      fn.mockReset();
      fn.mockResolvedValue({ recipient_id: "person", message_id: `bot_${Math.random()}` });
    }
    m.meta.getUserFollowStatus.mockResolvedValue(true);
    m.meta.getUserUsername.mockResolvedValue("ana");
  });

  describe("permissions", () => {
    it("lets a regular member see the accounts but not change them", async () => {
      m.role = "MEMBER";
      const list = (await (await GET()).json()).data;
      expect(list.canManage).toBe(false);
      // Follows the "no limit" default: no "of Y" on the Accounts tab.
      expect(list.accountLimit).toBeNull();
      expect(list.instagramAccounts.map((a: { id: string }) => a.id).sort()).toEqual(["acc1", "acc2"]);

      expect((await PATCH(req("PATCH", "?id=acc1", { automationsEnabled: false }))).status).toBe(403);
      expect((await DELETE(req("DELETE", "?id=acc1"))).status).toBe(403);
      expect((await legacyDisconnect(new NextRequest("https://app.test/api/instagram/disconnect", { method: "POST", body: JSON.stringify({ instagramAccountId: "acc1" }) }))).status).toBe(403);
      const account = await m.db.instagramAccount.findUniqueOrThrow({ where: { id: "acc1" } });
      expect(account.automationsEnabled).toBe(true);
    });

    it("lets owners and admins manage, and never touches another workspace's account", async () => {
      m.role = "ADMIN";
      expect((await (await GET()).json()).data.canManage).toBe(true);
      expect((await PATCH(req("PATCH", "?id=foreign", { automationsEnabled: false }))).status).toBe(404);
      expect((await DELETE(req("DELETE", "?id=foreign"))).status).toBe(404);
      expect(await m.db.instagramAccount.count({ where: { id: "foreign", automationsEnabled: true } })).toBe(1);
    });
  });

  describe("Ativa/Desativada", () => {
    it("fires while active", async () => {
      await processor(commentJob("p2"));
      await processor(messageJob());
      expect(privateReplies()).toBe(1);
      expect(m.meta.sendDirectMessage).toHaveBeenCalledTimes(1);
    });

    it("deactivated: comments, Direct and story messages are ignored, nothing is logged or deleted", async () => {
      const before = { automations: await m.db.automation.findMany({ orderBy: { id: "asc" } }), logs: await m.db.dmLog.count() };
      const res = await PATCH(req("PATCH", "?id=acc1", { automationsEnabled: false }));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toMatchObject({ automationsEnabled: false });

      await processor(commentJob("p1"));
      await processor(commentJob("p2"));
      await processor(messageJob());
      await processor({ ...messageJob(), data: { ...messageJob().data, channel: "STORY_REPLY" } });
      expect(sends()).toBe(0);
      expect(await m.db.dmLog.count()).toBe(before.logs);
      // Nothing about the automations changed.
      expect(await m.db.automation.findMany({ orderBy: { id: "asc" } })).toEqual(before.automations);
      // The other account keeps working.
      await processor({ ...commentJob("p7"), data: { ...commentJob("p7").data, instagramAccountId: "ig2" } });
      expect(privateReplies()).toBe(1);
    });

    it("button taps of a deactivated account are dropped too", async () => {
      await processor({ name: "process-postback", id: "pb", attemptsMade: 0, data: { instagramAccountId: "ig1", userId: "person_x", payload: "reveal:comments:open" } });
      expect(sends()).toBe(0);
    });

    it("reactivated: fires again, as before, and records when", async () => {
      const res = await PATCH(req("PATCH", "?id=acc1", { automationsEnabled: true }));
      const data = (await res.json()).data;
      expect(data.automationsEnabled).toBe(true);
      expect(Date.now() - new Date(data.automationsResumedAt).getTime()).toBeLessThan(10_000);

      await processor(commentJob("p1"));
      await processor(messageJob());
      expect(privateReplies()).toBe(1);
      expect(m.meta.sendDirectMessage).toHaveBeenCalledTimes(1);
      // The paused automation stays paused: reactivating the account restores, not overrides.
      expect((await m.db.automation.findUniqueOrThrow({ where: { id: "paused" } })).isActive).toBe(false);
    });

    it("rejects anything but the switch", async () => {
      expect((await PATCH(req("PATCH", "?id=acc1", { automationsEnabled: "no" }))).status).toBe(400);
      expect((await PATCH(req("PATCH", "?id=acc1", { username: "x" }))).status).toBe(400);
      expect((await PATCH(req("PATCH", "", { automationsEnabled: true }))).status).toBe(400);
    });
  });

  describe("removal", () => {
    it("the legacy endpoint no longer removes every account when no account is given", async () => {
      const res = await legacyDisconnect(new NextRequest("https://app.test/api/instagram/disconnect", { method: "POST", body: "{}" }));
      expect(res.status).toBe(400);
      expect(await m.db.instagramAccount.count({ where: { workspaceId: "w1" } })).toBe(2);
    });

    it("deletes the account with its automations, history, links, posts and media files — and only it", async () => {
      const image = await storeUpload({ workspaceId: "w1", buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(300)]) });
      await m.db.automationMedia.update({ where: { id: image.id }, data: { automationId: "comments", slot: "MAIN" } });
      const file = resolveMediaPath(image.storageKey);
      expect(existsSync(file)).toBe(true);
      expect(await m.db.dmLog.count({ where: { instagramAccountId: "acc1" } })).toBeGreaterThan(0);

      const res = await DELETE(req("DELETE", "?id=acc1"));
      expect(res.status).toBe(200);

      expect(await m.db.instagramAccount.findUnique({ where: { id: "acc1" } })).toBeNull();
      expect(await m.db.automation.count({ where: { instagramAccountId: "acc1" } })).toBe(0);
      expect(await m.db.dmLog.count({ where: { instagramAccountId: "acc1" } })).toBe(0);
      expect(await m.db.trackedLink.count({ where: { slug: "slug_acc1" } })).toBe(0);
      expect(await m.db.automationPost.count({ where: { automationId: "comments" } })).toBe(0);
      expect(await m.db.automationMedia.count({ where: { id: image.id } })).toBe(0);
      expect(existsSync(file)).toBe(false);
      // The workspace's other account and its automation are untouched.
      expect(await m.db.automation.count({ where: { id: "other_acc" } })).toBe(1);
      expect(await m.db.instagramAccount.count({ where: { id: "acc2" } })).toBe(1);
      expect((await DELETE(req("DELETE", "?id=acc1"))).status).toBe(404);
    });
  });
});

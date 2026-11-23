/**
 * Meta data deletion and retention, against a real Postgres.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
 *     npx vitest run __tests__/data-deletion.db.test.ts
 *
 * Builds the schema from prisma/migrations in a throwaway Postgres schema.
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({ db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient }));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));

import {
  handleMetaDataDeletion,
  hashMetaUserId,
  retryPendingDataDeletions,
  revokeInstagramAccess,
} from "../lib/privacy/data-deletion";
import { purgeExpiredData } from "../lib/privacy/purge";
import { removeInstagramAccounts } from "../lib/instagram/remove-account";
import { createSignedRequest } from "../lib/meta/signed-request";
import { POST as dataDeletionRoute } from "../app/api/webhooks/meta/data-deletion/route";
import { POST as deauthorizeRoute } from "../app/api/webhooks/meta/deauthorize/route";
import { NextRequest } from "next/server";

const SECRET = "test-facebook-app-secret";
const formPost = (url: string, signedRequest: string) =>
  new NextRequest(url, {
    method: "POST",
    body: new URLSearchParams({ signed_request: signedRequest }).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `deletion_${randomBytes(4).toString("hex")}`;
let sql: Client;

async function seedAccount(suffix: string, opts: { scopedId?: string; metaLoginUserId?: string } = {}) {
  const db = state.db;
  const workspaceId = `ws_${suffix}`;
  await db.user.upsert({ where: { id: "owner" }, update: {}, create: { id: "owner", email: "owner@example.test" } });
  await db.workspace.create({ data: { id: workspaceId, name: suffix, ownerId: "owner" } });
  const account = await db.instagramAccount.create({
    data: {
      id: `acc_${suffix}`,
      workspaceId,
      instagramId: `ig_${suffix}`,
      instagramScopedId: opts.scopedId ?? null,
      metaLoginUserId: opts.metaLoginUserId ?? null,
      username: suffix,
      accessToken: "encrypted",
    },
  });
  const automation = await db.automation.create({
    data: { id: `auto_${suffix}`, workspaceId, instagramAccountId: account.id, name: "LINK", keywords: ["LINK"], dmMessage: "Here" },
  });
  await db.dmLog.create({
    data: { workspaceId, automationId: automation.id, instagramAccountId: account.id, commenterId: "c1", commenterName: "fan", commentText: "LINK please", commentId: `cm_${suffix}` },
  });
  const link = await db.trackedLink.create({
    data: { workspaceId, automationId: automation.id, slug: `slug_${suffix}`, destinationUrl: "https://example.test" },
  });
  await db.linkClick.create({
    data: { workspaceId, automationId: automation.id, instagramAccountId: account.id, trackedLinkId: link.id },
  });
  await db.webhookEvent.create({
    data: { object: "instagram", payload: { object: "instagram", entry: [{ id: `ig_${suffix}`, changes: [{ field: "comments", value: { text: "LINK" } }] }] } },
  });
  await db.operationalEvent.create({
    data: { workspaceId, source: "WORKER", level: "ERROR", message: `send failed for @${suffix}`, payload: { instagramAccountId: account.id } },
  });
  return account;
}

describe.skipIf(!databaseUrl)("Meta data deletion on real PostgreSQL", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) {
      await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    }
    state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
  }, 60_000);

  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  beforeEach(async () => {
    await sql.query(`TRUNCATE "${schema}"."Workspace", "${schema}"."User", "${schema}"."WebhookEvent", "${schema}"."OperationalEvent", "${schema}"."DataDeletionRequest" CASCADE`);
  });

  it("deletes everything tied to the account and nothing of other customers", async () => {
    await seedAccount("victim");
    await seedAccount("bystander");

    const response = await handleMetaDataDeletion("ig_victim");

    expect(response.confirmation_code).toMatch(/^[0-9A-F]{16}$/);
    expect(response.url).toBe(`http://localhost:3000/exclusao-dados?codigo=${response.confirmation_code}`);

    const db = state.db;
    expect(await db.instagramAccount.findMany({ select: { id: true } })).toEqual([{ id: "acc_bystander" }]);
    expect(await db.automation.count({ where: { id: "auto_victim" } })).toBe(0);
    expect(await db.dmLog.count({ where: { instagramAccountId: "acc_victim" } })).toBe(0);
    expect(await db.trackedLink.count({ where: { slug: "slug_victim" } })).toBe(0);
    expect(await db.linkClick.count({ where: { instagramAccountId: "acc_victim" } })).toBe(0);
    expect(await db.webhookEvent.count()).toBe(1);
    expect(await db.operationalEvent.count({ where: { message: { contains: "@victim" } } })).toBe(0);
    expect(await db.dmLog.count({ where: { instagramAccountId: "acc_bystander" } })).toBe(1);

    const request = await db.dataDeletionRequest.findUniqueOrThrow({ where: { confirmationCode: response.confirmation_code } });
    expect(request.status).toBe("COMPLETED");
    expect(request.accountsDeleted).toBe(1);
    expect(request.metaUserId).toBeNull();
    expect(request.metaUserIdHash).toBe(hashMetaUserId("ig_victim"));
  });

  it("the trash button in Accounts deletes exactly what Meta's request deletes (as the Privacy Policy says)", async () => {
    await seedAccount("victim");
    await seedAccount("bystander");
    await state.db.botMessage.create({ data: { mid: "m_victim", instagramId: "ig_victim", recipientId: "c1" } });

    expect(await removeInstagramAccounts("ws_victim", ["acc_victim", "acc_bystander"])).toBe(1); // other workspaces ignored

    const db = state.db;
    expect(await db.instagramAccount.findMany({ select: { id: true } })).toEqual([{ id: "acc_bystander" }]);
    expect(await db.automation.count({ where: { id: "auto_victim" } })).toBe(0);
    expect(await db.dmLog.count({ where: { instagramAccountId: "acc_victim" } })).toBe(0);
    expect(await db.trackedLink.count({ where: { slug: "slug_victim" } })).toBe(0);
    expect(await db.linkClick.count({ where: { instagramAccountId: "acc_victim" } })).toBe(0);
    // Meta's notifications and the operational logs about it go too.
    expect(await db.webhookEvent.count()).toBe(1);
    expect(await db.operationalEvent.count({ where: { message: { contains: "@victim" } } })).toBe(0);
    expect(await db.botMessage.count({ where: { instagramId: "ig_victim" } })).toBe(0);
    expect(await db.dmLog.count({ where: { instagramAccountId: "acc_bystander" } })).toBe(1);
  });

  describe("the callbacks Meta calls, with a signed_request made in the test", () => {
    beforeEach(() => vi.stubEnv("FACEBOOK_APP_SECRET", SECRET));
    afterAll(() => vi.unstubAllEnvs());

    it("data deletion: valid → deletes and answers { url, confirmation_code }; the status says completed", async () => {
      await seedAccount("deleted", { metaLoginUserId: "fb_user_7" });
      const signed = createSignedRequest({ algorithm: "HMAC-SHA256", user_id: "fb_user_7", issued_at: 1 }, SECRET);
      const response = await dataDeletionRoute(formPost("https://app.test/api/webhooks/meta/data-deletion", signed));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Object.keys(body).sort()).toEqual(["confirmation_code", "url"]);
      expect(body.url).toMatch(new RegExp(`/exclusao-dados\\?codigo=${body.confirmation_code}$`));
      expect(await state.db.instagramAccount.count()).toBe(0);
      const request = await state.db.dataDeletionRequest.findUniqueOrThrow({ where: { confirmationCode: body.confirmation_code } });
      expect(request).toMatchObject({ status: "COMPLETED", accountsDeleted: 1, metaUserId: null });
    });

    it("data deletion: a wrong signature, a tampered payload or no signed_request → 400 and nothing deleted", async () => {
      await seedAccount("kept", { metaLoginUserId: "fb_user_8" });
      const forged = createSignedRequest({ algorithm: "HMAC-SHA256", user_id: "fb_user_8" }, "not-the-secret");
      const [signature] = createSignedRequest({ algorithm: "HMAC-SHA256", user_id: "someone" }, SECRET).split(".");
      const tampered = `${signature}.${Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "fb_user_8" })).toString("base64url")}`;
      for (const bad of [forged, tampered, ""]) {
        const response = await dataDeletionRoute(formPost("https://app.test/api/webhooks/meta/data-deletion", bad));
        expect(response.status).toBe(400);
      }
      expect(await state.db.instagramAccount.count()).toBe(1);
      expect(await state.db.dataDeletionRequest.count()).toBe(0);
    });

    it("deauthorize: valid → the token is wiped and the account flagged; forged → 400, untouched", async () => {
      await seedAccount("removed", { metaLoginUserId: "fb_user_9" });
      const forged = createSignedRequest({ algorithm: "HMAC-SHA256", user_id: "fb_user_9" }, "wrong");
      expect((await deauthorizeRoute(formPost("https://app.test/api/webhooks/meta/deauthorize", forged))).status).toBe(400);
      expect((await state.db.instagramAccount.findUniqueOrThrow({ where: { id: "acc_removed" } })).accessToken).toBe("encrypted");

      const signed = createSignedRequest({ algorithm: "HMAC-SHA256", user_id: "fb_user_9" }, SECRET);
      const response = await deauthorizeRoute(formPost("https://app.test/api/webhooks/meta/deauthorize", signed));
      expect(response.status).toBe(200);
      const account = await state.db.instagramAccount.findUniqueOrThrow({ where: { id: "acc_removed" } });
      expect(account.accessToken).toBe("");
      expect(account.tokenInvalidAt).not.toBeNull();
    });
  });

  it("matches the app-scoped Instagram id as well", async () => {
    await seedAccount("scoped", { scopedId: "app_scoped_42" });
    await handleMetaDataDeletion("app_scoped_42");
    expect(await state.db.instagramAccount.count()).toBe(0);
  });

  it("matches the Unified login token user as well", async () => {
    await seedAccount("unified", { metaLoginUserId: "system_user_9" });
    await handleMetaDataDeletion("system_user_9");
    expect(await state.db.instagramAccount.count()).toBe(0);
  });

  it("records NOT_FOUND (and warns) when nothing matches", async () => {
    await seedAccount("other");
    const response = await handleMetaDataDeletion("unknown_user");
    const request = await state.db.dataDeletionRequest.findUniqueOrThrow({ where: { confirmationCode: response.confirmation_code } });
    expect(request.status).toBe("NOT_FOUND");
    expect(await state.db.instagramAccount.count()).toBe(1);
    expect(await state.db.operationalEvent.count({ where: { level: "WARNING" } })).toBe(1);
  });

  it("retries a failed request from the purge job", async () => {
    await seedAccount("retry");
    await state.db.dataDeletionRequest.create({
      data: { confirmationCode: "00000000000000AA", metaUserIdHash: hashMetaUserId("ig_retry"), metaUserId: "ig_retry", status: "FAILED" },
    });
    const r = await retryPendingDataDeletions();
    expect(r).toEqual(["COMPLETED"]);
    expect(await state.db.instagramAccount.count()).toBe(0);
  });

  it("deauthorize wipes the token but keeps campaigns", async () => {
    await seedAccount("deauth", { scopedId: "scoped_deauth" });
    expect(await revokeInstagramAccess("scoped_deauth")).toBe(1);
    const account = await state.db.instagramAccount.findUniqueOrThrow({ where: { id: "acc_deauth" } });
    expect(account.accessToken).toBe("");
    expect(account.tokenInvalidAt).toBeInstanceOf(Date);
    expect(account.webhookSubscribed).toBe(false);
    expect(await state.db.automation.count()).toBe(1);
  });

  it("purges webhook payloads and logs past their retention period", async () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await state.db.webhookEvent.create({ data: { payload: { entry: [] }, createdAt: old } });
    await state.db.webhookEvent.create({ data: { payload: { entry: [] } } });
    await state.db.operationalEvent.create({ data: { source: "SYSTEM", message: "old", createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000) } });
    await state.db.operationalEvent.create({ data: { source: "SYSTEM", message: "recent" } });

    const result = await purgeExpiredData();
    expect(result.webhookEventsDeleted).toBe(1);
    expect(result.operationalEventsDeleted).toBe(1);
    expect(await state.db.webhookEvent.count()).toBe(1);
    expect((await state.db.operationalEvent.findMany()).map((e) => e.message)).toEqual(["recent"]);
  });
});

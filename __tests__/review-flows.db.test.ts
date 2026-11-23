/**
 * The Meta App Review screencast, flow by flow, end to end on a real Postgres
 * and a real Redis; only Meta is simulated (its Graph API answers and the
 * signed webhooks it sends). Each flow goes through the same code the app runs:
 * the login callback, the webhook route, the worker, the Accounts and Logs APIs.
 *
 *   1. Sign in as the reviewer (scripts/review-account.ts) → Connect Instagram →
 *      the account appears in Accounts (instagram_basic, business_management).
 *   2. Comment with the keyword → public reply and DM (instagram_manage_comments,
 *      instagram_manage_messages) → DM Logs.
 *   3. Direct message with the keyword → automatic reply (instagram_manage_messages).
 *   4. Reply to a story → automatic reply.
 *   5. Disconnect the account → its data is gone.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
 *     npx vitest run __tests__/review-flows.db.test.ts
 */
import { createHmac, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
  userId: "",
  jobs: [] as { name: string; data: Record<string, unknown> }[],
  processor: undefined as undefined | ((job: { name: string; data: Record<string, unknown>; id: string; attemptsMade: number }) => Promise<void>),
}));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/auth", () => ({
  auth: async () => ({ user: { id: state.userId } }),
  getCurrentUserId: async () => state.userId,
  getCurrentWorkspaceId: async () => (await state.db.workspace.findFirst({ where: { ownerId: state.userId } }))?.id ?? null,
}));
// The queue: jobs are kept here and handed to the worker's processor, as BullMQ
// would. Everything else on Redis (send limits, guards) is the real thing.
vi.mock("@/lib/queue/client", async (original) => ({
  ...(await original<typeof import("@/lib/queue/client")>()),
  getDMQueue: () => ({
    add: async (name: string, data: Record<string, unknown>) => {
      state.jobs.push({ name, data });
      return { id: `job_${state.jobs.length}` };
    },
    getJob: async () => undefined,
  }),
}));
vi.mock("bullmq", async (original) => ({
  ...(await original<typeof import("bullmq")>()),
  Worker: function (_name: string, processor: typeof state.processor) {
    state.processor = processor;
    return { on: () => {}, close: async () => {} };
  },
}));

import { resetReviewAccount } from "../lib/review/demo-account";
import { createOAuthState } from "../lib/meta/oauth";
import { GET as callbackRoute } from "../app/api/instagram/callback/route";
import { POST as webhookRoute } from "../app/api/webhook/route";
import { GET as accountsRoute, DELETE as disconnectRoute } from "../app/api/instagram/accounts/route";
import { GET as logsRoute } from "../app/api/logs/route";
import { createDMWorker } from "../lib/queue/dm-worker";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `review_${randomBytes(4).toString("hex")}`;
const APP_SECRET = "review-app-secret";
const IG_ID = `1784${randomBytes(5).toString("hex").replace(/\D/g, "1").slice(0, 10)}`;
const BASE = "https://app.test";
let sql: Client;

// ——— Meta, simulated ———
type Call = { method: string; url: URL; body: Record<string, unknown> | null };
const calls: Call[] = [];
// A different answer for one path, set by a test (undefined = the usual answers below).
let metaOverride: ((path: string) => Promise<Response> | undefined) | null = null;
const metaError = (code: number, message: string) =>
  Promise.resolve(new Response(JSON.stringify({ error: { message, type: "OAuthException", code, fbtrace_id: "trace" } }), { status: 403 }));
function graph(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  calls.push({ method, url, body });
  const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
  const p = url.pathname.replace(/^\/v[\d.]+/, "");
  const forced = metaOverride?.(p);
  if (forced) return forced;
  if (p === "/oauth/access_token") return json({ access_token: "system-user-token", token_type: "bearer" });
  if (p === "/debug_token") {
    // As Meta answers for a system user token (Facebook Login for Business):
    // business_management works but is not in `scopes`.
    return json({
      data: {
        type: "SYSTEM_USER",
        is_valid: true,
        user_id: "122000000000777",
        expires_at: 0,
        scopes: ["instagram_basic", "instagram_manage_comments", "instagram_manage_messages", "public_profile"],
        granular_scopes: [
          { scope: "instagram_basic", target_ids: [IG_ID] },
          { scope: "instagram_manage_comments", target_ids: [IG_ID] },
          { scope: "instagram_manage_messages", target_ids: [IG_ID] },
        ],
      },
    });
  }
  if (p === "/me/assigned_instagram_accounts") return json({ data: [{ id: IG_ID, username: "demo.store" }] });
  if (p === `/${IG_ID}` && method === "GET") return json({ id: IG_ID, username: "demo.store", name: "Demo Store" });
  if (p === `/${IG_ID}/subscribed_apps` && method === "POST") return json({ success: true });
  // What Meta confirms for the account: this app, with the fields it asked for.
  if (p === `/${IG_ID}/subscribed_apps`) return json({ data: [{ id: "1234567890", name: "ChatIntegrAI", subscribed_fields: ["comments", "messages", "messaging_postbacks"] }] });
  if (p === `/${IG_ID}/messages`) return json({ recipient_id: "person", message_id: `mid_${calls.length}` });
  if (/^\/[\w]+\/replies$/.test(p)) return json({ id: `reply_${calls.length}` });
  if (url.searchParams.get("fields") === "username") return json({ username: "story_fan" });
  return Promise.resolve(new Response(JSON.stringify({ error: { message: `unexpected ${method} ${p}`, code: 100 } }), { status: 400 }));
}
const sent = (since: number) => calls.slice(since).filter((c) => c.method === "POST");

function signedWebhook(payload: unknown) {
  const raw = JSON.stringify(payload);
  const signature = "sha256=" + createHmac("sha256", APP_SECRET).update(raw).digest("hex");
  return new NextRequest(`${BASE}/api/webhook`, { method: "POST", body: raw, headers: { "content-type": "application/json", "x-hub-signature-256": signature } });
}
async function runJobs() {
  while (state.jobs.length) {
    const job = state.jobs.shift()!;
    await state.processor!({ ...job, id: `job_${randomBytes(3).toString("hex")}`, attemptsMade: 0 });
  }
}

describe.skipIf(!databaseUrl)("Meta App Review screencast flows, end to end", () => {
  beforeAll(async () => {
    vi.stubEnv("NEXTAUTH_URL", BASE);
    vi.stubEnv("NEXTAUTH_SECRET", "review-nextauth-secret");
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("hex"));
    vi.stubEnv("META_LOGIN_CONFIG_ID", "1007716072385958");
    vi.stubEnv("META_APP_ID", "1234567890");
    vi.stubEnv("FACEBOOK_APP_SECRET", APP_SECRET);
    vi.stubEnv("INSTAGRAM_APP_SECRET", "");
    vi.stubGlobal("fetch", vi.fn(graph));
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
    createDMWorker();
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  it("0. the demo account: e-mail confirmed, workspace active, nothing connected yet", async () => {
    const result = await resetReviewAccount(state.db, { email: "Reviewer@Demo.test", password: "reviewer-pass-2026", linkUrl: BASE });
    state.userId = result.userId;
    const user = await state.db.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user).toMatchObject({ email: "reviewer@demo.test", locale: "en" });
    expect(user.emailVerified).not.toBeNull();
    const { verifyPassword } = await import("../lib/account/password");
    expect(await verifyPassword("reviewer-pass-2026", user.passwordHash!)).toBe(true);
    expect((await state.db.workspace.findUniqueOrThrow({ where: { id: result.workspaceId } })).status).toBe("ACTIVE");
    expect(result.instagram).toBeNull();
  });

  describe("   a login that Meta answers with a refusal or no account ends on Accounts with its code, nothing connected", () => {
    const connect = async () => {
      const workspace = await state.db.workspace.findFirstOrThrow({ where: { ownerId: state.userId } });
      const response = await callbackRoute(new NextRequest(`${BASE}/api/instagram/callback?code=meta-code&state=${encodeURIComponent(createOAuthState(workspace.id))}`));
      return { workspace, location: response.headers.get("location") };
    };
    afterEach(() => {
      metaOverride = null;
    });

    it("the account list refused for lack of permission (code 200) → missing_permissions naming business_management", async () => {
      metaOverride = (p) => (p === "/me/assigned_instagram_accounts" ? metaError(200, "(#200) Requires business_management permission to manage the object") : undefined);
      const { workspace, location } = await connect();
      expect(location).toBe(`${BASE}/accounts?instagram=missing_permissions&missing=business_management`);
      expect(await state.db.instagramAccount.count({ where: { workspaceId: workspace.id } })).toBe(0);
      const event = await state.db.operationalEvent.findFirstOrThrow({ where: { workspaceId: workspace.id, message: "Instagram connection refused by Meta: missing business_management" } });
      expect(event.payload).toMatchObject({ permission: "business_management", reason: expect.stringContaining("code=200") });
    });

    it("the account's details refused (code 10) → missing_permissions naming instagram_basic", async () => {
      metaOverride = (p) => (p === `/${IG_ID}` ? metaError(10, "(#10) Application does not have permission for this action") : undefined);
      const { workspace, location } = await connect();
      expect(location).toBe(`${BASE}/accounts?instagram=missing_permissions&missing=instagram_basic`);
      expect(await state.db.instagramAccount.count({ where: { workspaceId: workspace.id } })).toBe(0);
    });

    it("no Instagram account in the login (empty list) → no_account", async () => {
      metaOverride = (p) => (p === "/me/assigned_instagram_accounts" ? Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 })) : undefined);
      const { workspace, location } = await connect();
      expect(location).toBe(`${BASE}/accounts?instagram=no_account`);
      expect(await state.db.instagramAccount.count({ where: { workspaceId: workspace.id } })).toBe(0);
    });
  });

  it("1. Connect Instagram → Meta's login → the account appears in Accounts", async () => {
    const workspace = await state.db.workspace.findFirstOrThrow({ where: { ownerId: state.userId } });
    const before = calls.length;
    const response = await callbackRoute(new NextRequest(`${BASE}/api/instagram/callback?code=meta-code&state=${encodeURIComponent(createOAuthState(workspace.id))}`));
    expect(response.headers.get("location")).toBe(`${BASE}/accounts?instagram=connected`);
    const paths = calls.slice(before).map((c) => `${c.method} ${c.url.pathname.replace(/^\/v[\d.]+/, "")}`);
    expect(paths).toEqual([
      "GET /oauth/access_token",
      "GET /debug_token", // what Meta reports about the token (recorded, not decided on)
      "GET /me/assigned_instagram_accounts", // business_management
      `GET /${IG_ID}`, // instagram_basic: username, name
      `POST /${IG_ID}/subscribed_apps`, // comments and messages notifications
      `GET /${IG_ID}/subscribed_apps`, // what Meta confirms (recorded in Diagnostics)
    ]);
    const accounts = await (await accountsRoute()).json();
    expect(accounts.data.instagramAccounts).toEqual([expect.objectContaining({ username: "demo.store", instagramId: IG_ID })]);
    // business_management is absent from `scopes` yet the connection went through;
    // what debug_token reported is in the admin's Diagnostics, without the token.
    const report = await state.db.operationalEvent.findFirstOrThrow({
      where: { workspaceId: workspace.id, message: { startsWith: "Instagram login: Meta's debug_token reports scopes" } },
      orderBy: { createdAt: "desc" },
    });
    expect(report.payload).toMatchObject({
      type: "SYSTEM_USER",
      scopes: ["instagram_basic", "instagram_manage_comments", "instagram_manage_messages", "public_profile"],
      granularScopes: expect.arrayContaining([{ scope: "instagram_basic", target_ids: [IG_ID] }]),
      notInScopes: ["business_management"],
    });
    expect(JSON.stringify(report)).not.toContain("system-user-token");
    // And what Meta confirms for the account's notifications.
    const notifications = await state.db.operationalEvent.findFirstOrThrow({
      where: { workspaceId: workspace.id, message: { startsWith: "Instagram notifications for @demo.store" } },
      orderBy: { createdAt: "desc" },
    });
    expect(notifications).toMatchObject({ level: "INFO", message: "Instagram notifications for @demo.store: Meta confirms comments, messages, messaging_postbacks" });
  });

  it("   the demo script then adds one automation per channel, in English, Direct mode, no follow gate", async () => {
    const result = await resetReviewAccount(state.db, { email: "reviewer@demo.test", password: "reviewer-pass-2026", linkUrl: BASE, sampleLogs: false });
    expect(result.instagram?.username).toBe("demo.store");
    expect(result.automations.map((a) => a.type)).toEqual(["COMMENTS", "STORIES", "DIRECT"]);
    const automations = await state.db.automation.findMany({ where: { workspaceId: result.workspaceId } });
    for (const a of automations) expect(a).toMatchObject({ openingDmEnabled: false, requireFollow: false, isActive: true, dmDelaySeconds: 0 });
  });

  it("2. a comment with the keyword → public reply and DM → DM Logs", async () => {
    const before = calls.length;
    const webhook = await webhookRoute(
      signedWebhook({
        object: "instagram",
        entry: [{ id: IG_ID, time: 1, changes: [{ field: "comments", value: { id: "comment_1", text: "LINK please", from: { id: "commenter_1", username: "fan_one" }, media: { id: "post_1" } } }] }],
      })
    );
    expect(webhook.status).toBe(200);
    await runJobs();
    const posts = sent(before);
    expect(posts.map((c) => c.url.pathname.replace(/^\/v[\d.]+/, ""))).toEqual(["/comment_1/replies", `/${IG_ID}/messages`]);
    expect(posts[0].body).toEqual({ message: expect.stringMatching(/Sent you a DM 📩|Check your DMs 📩/) });
    expect(posts[1].body).toMatchObject({ recipient: { comment_id: "comment_1" } });
    expect(JSON.stringify(posts[1].body)).toContain("Hi fan_one! Here is the catalog you asked for");

    const logs = await (await logsRoute(new NextRequest(`${BASE}/api/logs?page=1&limit=20`))).json();
    expect(logs.data.logs ?? logs.data).toEqual(expect.arrayContaining([expect.objectContaining({ commentId: "comment_1", status: "SENT", commenterName: "fan_one" })]));
  });

  it("3. a Direct message with the keyword → automatic reply", async () => {
    const before = calls.length;
    await webhookRoute(
      signedWebhook({ object: "instagram", entry: [{ id: IG_ID, time: 2, messaging: [{ sender: { id: "dm_person" }, recipient: { id: IG_ID }, timestamp: 2, message: { mid: "mid_dm_1", text: "What is the PRICE?" } }] }] })
    );
    await runJobs();
    const posts = sent(before);
    expect(posts.map((c) => c.url.pathname.replace(/^\/v[\d.]+/, ""))).toEqual([`/${IG_ID}/messages`]);
    expect(posts[0].body).toMatchObject({ recipient: { id: "dm_person" } });
    expect(JSON.stringify(posts[0].body)).toContain("Here is our price list");
    expect(await state.db.dmLog.count({ where: { commenterId: "dm_person", status: "SENT" } })).toBe(1);
  });

  it("   a read receipt (someone only read a DM) is accepted, recorded and ignored: no job, nothing sent", async () => {
    const before = calls.length;
    const jobsBefore = state.jobs.length;
    const response = await webhookRoute(
      signedWebhook({ object: "instagram", entry: [{ id: IG_ID, time: 3, messaging: [{ sender: { id: "dm_person" }, recipient: { id: IG_ID }, timestamp: 3, read: { watermark: 3 } }] }] })
    );
    expect(response.status).toBe(200);
    await runJobs();
    expect(state.jobs.length).toBe(jobsBefore);
    expect(sent(before)).toEqual([]);
    const event = await state.db.webhookEvent.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(event.status).toBe("PROCESSED");
    expect(event.errorMessage).toBeNull();
    // And the account is no longer subscribed to read receipts.
    const subscribe = calls.find((c) => c.method === "POST" && c.url.pathname.endsWith("/subscribed_apps"));
    expect(subscribe?.body?.subscribed_fields).toEqual(["comments", "messages", "messaging_postbacks"]);
  });

  it("4. a reply to a story → automatic reply", async () => {
    const before = calls.length;
    await webhookRoute(
      signedWebhook({
        object: "instagram",
        entry: [{ id: IG_ID, time: 3, messaging: [{ sender: { id: "story_person" }, recipient: { id: IG_ID }, timestamp: 3, message: { mid: "mid_story_1", text: "Love this!", reply_to: { story: { id: "story_1", url: "https://cdn.test/story" } } } }] }],
      })
    );
    await runJobs();
    const posts = sent(before);
    expect(posts.map((c) => c.url.pathname.replace(/^\/v[\d.]+/, ""))).toEqual([`/${IG_ID}/messages`]);
    expect(posts[0].body).toMatchObject({ recipient: { id: "story_person" } });
    expect(JSON.stringify(posts[0].body)).toContain("Thanks for replying to our story");
  });

  it("   a forged webhook (wrong signature) is refused and nothing is sent", async () => {
    const before = calls.length;
    const forged = new NextRequest(`${BASE}/api/webhook`, {
      method: "POST",
      body: JSON.stringify({ object: "instagram", entry: [] }),
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=00" },
    });
    expect((await webhookRoute(forged)).status).toBe(401);
    expect(state.jobs).toEqual([]);
    expect(sent(before)).toEqual([]);
  });

  it("5. disconnect the account → it and its data are deleted", async () => {
    const account = await state.db.instagramAccount.findUniqueOrThrow({ where: { instagramId: IG_ID } });
    const response = await disconnectRoute(new NextRequest(`${BASE}/api/instagram/accounts?id=${account.id}`, { method: "DELETE" }));
    expect(response.status).toBe(200);
    expect(await state.db.instagramAccount.count()).toBe(0);
    expect(await state.db.automation.count()).toBe(0);
    expect(await state.db.dmLog.count()).toBe(0);
    expect(await state.db.trackedLink.count()).toBe(0);
    // Meta's notifications about it go as well.
    expect(await state.db.webhookEvent.count({ where: { payload: { path: ["entry"], array_contains: [{ id: IG_ID }] } } })).toBe(0);
  });
});

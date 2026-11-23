/**
 * The Meta App Review screencast and every feature the app has, end to end on
 * a real Postgres and a real Redis, with Instagram's login (Business Login for
 * Instagram); only Meta is simulated: api.instagram.com and graph.instagram.com
 * answers, the webhooks it signs with the Instagram app secret, and the
 * signed_request of the deauthorize and data deletion callbacks. Each flow goes
 * through the same code the app runs: the login callback, the webhook route,
 * the worker, the routines and the callbacks.
 *
 *   1. Sign in as the reviewer (scripts/review-account.ts) → Connect Instagram →
 *      the account appears in Accounts (instagram_business_basic).
 *   2. Comment with the keyword → public reply and private reply with the link
 *      button (instagram_business_manage_comments, _manage_messages) → DM Logs.
 *   3. Direct message with the keyword → automatic reply.
 *   4. Reply to a story → automatic reply.
 *   Then: story mention, opening DM and button taps, follow check, echoes and
 *   the human pause, the wait before answering, images and videos, the posts
 *   and reels list, the 60-day token renewal, a forged webhook.
 *   5. Disconnect the account → its data is gone.
 *   6. An account from the old Facebook (Unified) login: marked to reconnect,
 *      nothing sent with it, reconnected in place; then Instagram's deauthorize
 *      and data deletion callbacks.
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
  jobs: [] as { name: string; data: Record<string, unknown>; opts?: { delay?: number } }[],
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
    add: async (name: string, data: Record<string, unknown>, opts?: { delay?: number }) => {
      state.jobs.push({ name, data, opts });
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
import { GET as postsRoute } from "../app/api/instagram/posts/route";
import { POST as deauthorizeRoute } from "../app/api/webhooks/meta/deauthorize/route";
import { POST as dataDeletionRoute } from "../app/api/webhooks/meta/data-deletion/route";
import { createDMWorker } from "../lib/queue/dm-worker";
import { refreshExpiringTokens } from "../lib/meta/token-refresh";
import { createSignedRequest } from "../lib/meta/signed-request";
import { decryptToken } from "../lib/meta/oauth";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `review_${randomBytes(4).toString("hex")}`;
// The Instagram app secret (API setup with Instagram login): signs webhooks and signed requests.
const APP_SECRET = "review-instagram-app-secret";
const IG_ID = `1784${randomBytes(5).toString("hex").replace(/\D/g, "1").slice(0, 10)}`;
const BASE = "https://app.test";
let sql: Client;

// ——— Meta, simulated (Instagram's login) ———
const SCOPED_ID = "app_scoped_777";
const SHORT_TOKEN = "ig-short-token";
const LONG_TOKEN = "ig-long-token";
const RENEWED_TOKEN = "ig-renewed-token";
const FIELDS = ["comments", "messages", "messaging_postbacks", "message_echoes"];
const ALL_PERMISSIONS = "instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages";
type Call = { method: string; url: URL; body: Record<string, unknown> | null };
const calls: Call[] = [];
// A different answer for one path, set by a test (undefined = the usual answers below).
let metaOverride: ((path: string, method: string) => Promise<Response> | undefined) | null = null;
// The permissions Instagram's screen returns with the code.
let grantedPermissions = ALL_PERMISSIONS;
// Who follows the account (is_user_follow_business); everyone else does.
const notFollowing = new Set<string>();
const metaError = (code: number, message: string) =>
  Promise.resolve(new Response(JSON.stringify({ error: { message, type: "OAuthException", code, fbtrace_id: "trace" } }), { status: 403 }));
function parseBody(init?: RequestInit): Record<string, unknown> | null {
  if (!init?.body) return null;
  const text = String(init.body);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}
function graph(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  calls.push({ method, url, body: parseBody(init) });
  const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
  const p = url.pathname.replace(/^\/v[\d.]+/, "");
  const forced = metaOverride?.(p, method);
  if (forced) return forced;
  // The code → a short-lived token, the app-scoped id and the permissions left on.
  if (url.host === "api.instagram.com" && p === "/oauth/access_token" && method === "POST") {
    return json({ data: [{ access_token: SHORT_TOKEN, user_id: SCOPED_ID, permissions: grantedPermissions }] });
  }
  if (url.host !== "graph.instagram.com") return Promise.resolve(new Response(JSON.stringify({ error: { message: `unexpected host ${url.host}`, code: 100 } }), { status: 400 }));
  if (p === "/access_token" && url.searchParams.get("grant_type") === "ig_exchange_token") return json({ access_token: LONG_TOKEN, token_type: "bearer", expires_in: 5184000 });
  if (p === "/refresh_access_token" && url.searchParams.get("grant_type") === "ig_refresh_token") return json({ access_token: RENEWED_TOKEN, token_type: "bearer", expires_in: 5184000 });
  // /me: `id` is app-scoped; user_id is the professional account id webhooks carry.
  if (p === "/me" && method === "GET") return json({ id: SCOPED_ID, user_id: IG_ID, username: "demo.store", name: "Demo Store", profile_picture_url: "https://cdn.test/p.jpg" });
  if (p === "/me/media") {
    return json({ data: [{ id: "reel_1", media_type: "VIDEO", media_product_type: "REELS", caption: "New reel", permalink: "https://www.instagram.com/reel/abc/", timestamp: "2026-11-20T10:00:00+0000" }] });
  }
  if (p === `/${IG_ID}/subscribed_apps` && method === "POST") return json({ success: true });
  // What Meta confirms for the account: this app, with the fields it asked for.
  if (p === `/${IG_ID}/subscribed_apps`) return json({ data: [{ id: "1234567890", name: "ChatIntegrAI", subscribed_fields: FIELDS }] });
  if (p === `/${IG_ID}/messages`) return json({ recipient_id: "person", message_id: `mid_bot_${calls.length}` });
  if (/^\/[\w]+\/replies$/.test(p)) return json({ id: `reply_${calls.length}` });
  if (url.searchParams.get("fields") === "is_user_follow_business") return json({ is_user_follow_business: !notFollowing.has(p.slice(1)) });
  if (url.searchParams.get("fields") === "username") return json({ username: "story_fan" });
  return Promise.resolve(new Response(JSON.stringify({ error: { message: `unexpected ${method} ${p}`, code: 100 } }), { status: 400 }));
}
const pathOf = (c: Call) => c.url.pathname.replace(/^\/v[\d.]+/, "");
const sent = (since: number) => calls.slice(since).filter((c) => c.method === "POST");

function signedWebhook(payload: unknown) {
  const raw = JSON.stringify(payload);
  const signature = "sha256=" + createHmac("sha256", APP_SECRET).update(raw).digest("hex");
  return new NextRequest(`${BASE}/api/webhook`, { method: "POST", body: raw, headers: { "content-type": "application/json", "x-hub-signature-256": signature } });
}
async function runJobs() {
  while (state.jobs.length) {
    const job = state.jobs.shift()!;
    await state.processor!({ name: job.name, data: job.data, id: `job_${randomBytes(3).toString("hex")}`, attemptsMade: 0 });
  }
}
const formPost = (url: string, signedRequest: string) =>
  new NextRequest(url, { method: "POST", body: new URLSearchParams({ signed_request: signedRequest }).toString(), headers: { "content-type": "application/x-www-form-urlencoded" } });
const workspaceOf = () => state.db.workspace.findFirstOrThrow({ where: { ownerId: state.userId } });
async function connect() {
  const workspace = await workspaceOf();
  const response = await callbackRoute(new NextRequest(`${BASE}/api/instagram/callback?code=instagram-code&state=${encodeURIComponent(createOAuthState(workspace.id))}`));
  return { workspace, location: response.headers.get("location") };
}
const automationOf = (type: "COMMENTS" | "STORIES" | "DIRECT") => state.db.automation.findFirstOrThrow({ where: { type } });
const comment = (id: string, from: string, text = "LINK please") =>
  signedWebhook({ object: "instagram", entry: [{ id: IG_ID, time: 1, changes: [{ field: "comments", value: { id, text, from: { id: from, username: from }, media: { id: "post_1" } } }] }] });
const direct = (from: string, mid: string, message: Record<string, unknown>) =>
  signedWebhook({ object: "instagram", entry: [{ id: IG_ID, time: 2, messaging: [{ sender: { id: from }, recipient: { id: IG_ID }, timestamp: 2, message: { mid, ...message } }] }] });
const tap = (from: string, payload: string, mid: string) =>
  signedWebhook({ object: "instagram", entry: [{ id: IG_ID, time: 3, messaging: [{ sender: { id: from }, recipient: { id: IG_ID }, timestamp: 3, postback: { mid, title: "Tap", payload } }] }] });

describe.skipIf(!databaseUrl)("Instagram's login: the App Review flows and every feature, end to end", () => {
  beforeAll(async () => {
    vi.stubEnv("NEXTAUTH_URL", BASE);
    vi.stubEnv("NEXTAUTH_SECRET", "review-nextauth-secret");
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("hex"));
    vi.stubEnv("INSTAGRAM_APP_ID", "1234567890");
    vi.stubEnv("INSTAGRAM_APP_SECRET", APP_SECRET);
    // Only the Instagram app secret: the Facebook one is not needed.
    vi.stubEnv("FACEBOOK_APP_SECRET", "");
    vi.stubEnv("META_APP_ID", "");
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

  describe("   a login that ends without every permission lands on Accounts with its code, nothing connected", () => {
    afterEach(() => {
      metaOverride = null;
      grantedPermissions = ALL_PERMISSIONS;
    });

    it("a permission turned off on Instagram's screen → missing_permissions naming it", async () => {
      grantedPermissions = "instagram_business_basic,instagram_business_manage_comments";
      const { workspace, location } = await connect();
      expect(location).toBe(`${BASE}/accounts?instagram=missing_permissions&missing=instagram_business_manage_messages`);
      expect(await state.db.instagramAccount.count({ where: { workspaceId: workspace.id } })).toBe(0);
    });

    it("the account refused by Meta (code 10) → missing_permissions naming instagram_business_basic", async () => {
      metaOverride = (p) => (p === "/me" ? metaError(10, "(#10) Application does not have permission for this action") : undefined);
      const { workspace, location } = await connect();
      expect(location).toBe(`${BASE}/accounts?instagram=missing_permissions&missing=instagram_business_basic`);
      expect(await state.db.instagramAccount.count({ where: { workspaceId: workspace.id } })).toBe(0);
      const event = await state.db.operationalEvent.findFirstOrThrow({ where: { workspaceId: workspace.id, message: "Instagram connection refused by Meta: missing instagram_business_basic" } });
      expect(event.payload).toMatchObject({ permission: "instagram_business_basic", reason: expect.stringContaining("code=10") });
    });
  });

  it("1. Connect Instagram → Instagram's login → the account appears in Accounts", async () => {
    const before = calls.length;
    const { workspace, location } = await connect();
    expect(location).toBe(`${BASE}/accounts?instagram=connected`);
    const made = calls.slice(before);
    expect(made.map((c) => `${c.method} ${c.url.host}${pathOf(c)}`)).toEqual([
      "POST api.instagram.com/oauth/access_token", // the code → short-lived token and permissions
      "GET graph.instagram.com/access_token", // the 60-day token
      "GET graph.instagram.com/me", // instagram_business_basic: user_id, username, name
      `POST graph.instagram.com/${IG_ID}/subscribed_apps`, // notifications
      `GET graph.instagram.com/${IG_ID}/subscribed_apps`, // what Meta confirms (Diagnostics)
    ]);
    expect(made[0].body).toMatchObject({ client_id: "1234567890", client_secret: APP_SECRET, grant_type: "authorization_code", code: "instagram-code", redirect_uri: `${BASE}/api/instagram/callback` });
    expect(made[3].body).toEqual({ subscribed_fields: FIELDS });
    expect(calls.some((c) => c.url.host.includes("facebook"))).toBe(false);

    const accounts = await (await accountsRoute()).json();
    expect(accounts.data.instagramAccounts).toEqual([expect.objectContaining({ username: "demo.store", instagramId: IG_ID })]);
    const row = await state.db.instagramAccount.findUniqueOrThrow({ where: { instagramId: IG_ID } });
    expect(row).toMatchObject({ metaLogin: "INSTAGRAM", instagramScopedId: SCOPED_ID, metaLoginUserId: null, webhookSubscribed: true, tokenInvalidAt: null });
    expect(decryptToken(row.accessToken)).toBe(LONG_TOKEN);
    expect(row.tokenExpiresAt!.getTime() - Date.now()).toBeGreaterThan(59 * 86_400_000);

    const granted = await state.db.operationalEvent.findFirstOrThrow({ where: { workspaceId: workspace.id, message: { startsWith: "Instagram login: permissions granted" } }, orderBy: { createdAt: "desc" } });
    expect(granted.payload).toEqual({ granted: ALL_PERMISSIONS.split(","), missing: [] });
    const notifications = await state.db.operationalEvent.findFirstOrThrow({
      where: { workspaceId: workspace.id, message: { startsWith: "Instagram notifications for @demo.store" } },
      orderBy: { createdAt: "desc" },
    });
    expect(notifications).toMatchObject({ level: "INFO", message: "Instagram notifications for @demo.store: Meta confirms comments, messages, messaging_postbacks, message_echoes" });
    expect(JSON.stringify([granted, notifications])).not.toMatch(/ig-(short|long)-token/);
  });

  it("   the demo script then adds one automation per channel, in English, Direct mode, no follow gate", async () => {
    const result = await resetReviewAccount(state.db, { email: "reviewer@demo.test", password: "reviewer-pass-2026", linkUrl: BASE, sampleLogs: false });
    expect(result.instagram?.username).toBe("demo.store");
    expect(result.automations.map((a) => a.type)).toEqual(["COMMENTS", "STORIES", "DIRECT"]);
    const automations = await state.db.automation.findMany({ where: { workspaceId: result.workspaceId } });
    for (const a of automations) expect(a).toMatchObject({ openingDmEnabled: false, requireFollow: false, isActive: true, dmDelaySeconds: 0 });
    // The account keeps Instagram's login.
    expect((await state.db.instagramAccount.findUniqueOrThrow({ where: { instagramId: IG_ID } })).metaLogin).toBe("INSTAGRAM");
  });

  it("2. a comment with the keyword → public reply and private reply with the link button → DM Logs", async () => {
    const before = calls.length;
    const webhook = await webhookRoute(comment("comment_1", "fan_one"));
    expect(webhook.status).toBe(200);
    await runJobs();
    const posts = sent(before);
    expect(posts.map((c) => `${c.url.host}${pathOf(c)}`)).toEqual(["graph.instagram.com/comment_1/replies", `graph.instagram.com/${IG_ID}/messages`]);
    expect(posts[0].body).toEqual({ message: expect.stringMatching(/Sent you a DM 📩|Check your DMs 📩/) });
    // The private reply: to the comment, a button template with the tracked link.
    expect(posts[1].body).toMatchObject({ recipient: { comment_id: "comment_1" } });
    const dm = JSON.stringify(posts[1].body);
    expect(dm).toContain("Hi fan_one! Here is the catalog you asked for");
    expect(dm).toContain('"type":"web_url"');
    expect(dm).toMatch(new RegExp(`"url":"${BASE}/r/[\\w-]+`));

    const logs = await (await logsRoute(new NextRequest(`${BASE}/api/logs?page=1&limit=20`))).json();
    expect(logs.data.logs ?? logs.data).toEqual(expect.arrayContaining([expect.objectContaining({ commentId: "comment_1", status: "SENT", commenterName: "fan_one" })]));
    // The receipt: the entry id (user_id) matched the connected account.
    const receipt = await state.db.webhookReceipt.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(receipt).toMatchObject({ object: "instagram", accepted: true, reason: null });
    expect(receipt.entries).toEqual([expect.objectContaining({ id: IG_ID, fields: ["comments"], accepted: true })]);
  });

  it("3. a Direct message with the keyword → automatic reply", async () => {
    const before = calls.length;
    await webhookRoute(direct("dm_person", "mid_dm_1", { text: "What is the PRICE?" }));
    await runJobs();
    const posts = sent(before);
    expect(posts.map(pathOf)).toEqual([`/${IG_ID}/messages`]);
    expect(posts[0].body).toMatchObject({ recipient: { id: "dm_person" } });
    expect(JSON.stringify(posts[0].body)).toContain("Here is our price list");
    expect(await state.db.dmLog.count({ where: { commenterId: "dm_person", status: "SENT" } })).toBe(1);
  });

  it("   a read receipt (someone only read a DM) is accepted and ignored: no job, nothing sent", async () => {
    const before = calls.length;
    const jobsBefore = state.jobs.length;
    const response = await webhookRoute(
      signedWebhook({ object: "instagram", entry: [{ id: IG_ID, time: 3, messaging: [{ sender: { id: "dm_person" }, recipient: { id: IG_ID }, timestamp: 3, read: { mid: "mid_dm_1" } }] }] })
    );
    expect(response.status).toBe(200);
    await runJobs();
    expect(state.jobs.length).toBe(jobsBefore);
    expect(sent(before)).toEqual([]);
    const event = await state.db.webhookEvent.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(event.status).toBe("PROCESSED");
  });

  it("4. a reply to a story → automatic reply", async () => {
    const before = calls.length;
    await webhookRoute(direct("story_person", "mid_story_1", { text: "Love this!", reply_to: { story: { id: "story_1", url: "https://cdn.test/story" } } }));
    await runJobs();
    const posts = sent(before);
    expect(posts.map(pathOf)).toEqual([`/${IG_ID}/messages`]);
    expect(posts[0].body).toMatchObject({ recipient: { id: "story_person" } });
    expect(JSON.stringify(posts[0].body)).toContain("Thanks for replying to our story");
  });

  it("   a mention in someone's story → automatic reply (Stories, mentions on)", async () => {
    const stories = await automationOf("STORIES");
    await state.db.automation.update({ where: { id: stories.id }, data: { triggerStoryMentions: true } });
    const before = calls.length;
    await webhookRoute(direct("mention_person", "mid_mention_1", { attachments: [{ type: "story_mention", payload: { url: "https://cdn.test/mention" } }] }));
    await runJobs();
    const posts = sent(before);
    expect(posts.map(pathOf)).toEqual([`/${IG_ID}/messages`]);
    expect(posts[0].body).toMatchObject({ recipient: { id: "mention_person" } });
  });

  it("   opening DM with a button → the tap (postback) delivers the link", async () => {
    const comments = await automationOf("COMMENTS");
    await state.db.automation.update({
      where: { id: comments.id },
      data: { openingDmEnabled: true, openingDmMessage: "Tap below and I will send the link", openingDmButtonLabel: "Send me the link" },
    });
    let before = calls.length;
    await webhookRoute(comment("comment_2", "fan_two"));
    await runJobs();
    let posts = sent(before);
    const opening = posts.find((c) => pathOf(c) === `/${IG_ID}/messages`)!;
    expect(opening.body).toMatchObject({ recipient: { comment_id: "comment_2" } });
    expect(JSON.stringify(opening.body)).toContain(`"payload":"reveal:${comments.id}:open"`);
    expect(JSON.stringify(opening.body)).not.toContain("/r/");

    before = calls.length;
    await webhookRoute(tap("fan_two", `reveal:${comments.id}:open`, "mid_tap_1"));
    await runJobs();
    posts = sent(before);
    expect(posts.map(pathOf)).toEqual([`/${IG_ID}/messages`]);
    expect(posts[0].body).toMatchObject({ recipient: { id: "fan_two" } });
    expect(JSON.stringify(posts[0].body)).toContain('"type":"web_url"');
  });

  it("   follow check: a non-follower gets the request, and the link once following", async () => {
    const comments = await automationOf("COMMENTS");
    await state.db.automation.update({ where: { id: comments.id }, data: { requireFollow: true } });
    notFollowing.add("fan_three");
    await webhookRoute(comment("comment_3", "fan_three"));
    await runJobs();

    // The opening DM's tap checks the follow (User Profile API).
    let before = calls.length;
    await webhookRoute(tap("fan_three", `followcheck:${comments.id}:open`, "mid_tap_2"));
    await runJobs();
    let made = calls.slice(before);
    expect(made.some((c) => c.method === "GET" && pathOf(c) === "/fan_three" && c.url.searchParams.get("fields") === "is_user_follow_business")).toBe(true);
    let posts = sent(before);
    expect(posts).toHaveLength(1);
    expect(JSON.stringify(posts[0].body)).toContain(`"payload":"followcheck:${comments.id}"`);
    expect(JSON.stringify(posts[0].body)).not.toContain("/r/");

    // Follows now → "I follow" tap → the link.
    notFollowing.delete("fan_three");
    before = calls.length;
    await webhookRoute(tap("fan_three", `followcheck:${comments.id}`, "mid_tap_3"));
    await runJobs();
    made = calls.slice(before);
    posts = sent(before);
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ recipient: { id: "fan_three" } });
    expect(JSON.stringify(posts[0].body)).toContain('"type":"web_url"');
    await state.db.automation.update({ where: { id: comments.id }, data: { requireFollow: false, openingDmEnabled: false } });
  });

  it("   echoes: a message someone from the account sent in the Instagram app pauses the no-keyword Direct automation", async () => {
    const directAutomation = await automationOf("DIRECT");
    await state.db.automation.update({ where: { id: directAutomation.id }, data: { keywords: [], matchAnyWord: true } });
    await webhookRoute(
      signedWebhook({ object: "instagram", entry: [{ id: IG_ID, time: 4, messaging: [{ sender: { id: IG_ID }, recipient: { id: "human_person" }, timestamp: 4, message: { mid: "human_mid_1", text: "Hi! It's Ana from the store", is_echo: true } }] }] })
    );
    await runJobs();
    const account = await state.db.instagramAccount.findUniqueOrThrow({ where: { instagramId: IG_ID } });
    expect(await state.db.conversationActivity.count({ where: { instagramAccountId: account.id, recipientId: "human_person" } })).toBe(1);

    const before = calls.length;
    await webhookRoute(direct("human_person", "mid_human_reply", { text: "Thanks Ana" }));
    await runJobs();
    expect(sent(before)).toEqual([]);
    expect(await state.db.dmLog.findFirstOrThrow({ where: { commenterId: "human_person" } })).toMatchObject({ status: "SKIPPED_HUMAN_ACTIVE" });

    // Someone nobody talked to is answered.
    const other = calls.length;
    await webhookRoute(direct("new_person", "mid_new_1", { text: "hello" }));
    await runJobs();
    expect(sent(other).map(pathOf)).toEqual([`/${IG_ID}/messages`]);
    // The bot's own messages are recorded, so their echoes never pause anything.
    expect(await state.db.botMessage.count({ where: { instagramId: IG_ID } })).toBeGreaterThan(0);
  });

  it("   the wait before answering, then text, image and video", async () => {
    const directAutomation = await automationOf("DIRECT");
    await state.db.automation.update({ where: { id: directAutomation.id }, data: { keywords: ["PRICE"], matchAnyWord: false, dmDelaySeconds: 30 } });
    await state.db.automationMedia.createMany({
      data: [
        { workspaceId: directAutomation.workspaceId, automationId: directAutomation.id, slot: "MAIN", position: 0, kind: "IMAGE", mimeType: "image/jpeg", sizeBytes: 1000, storageKey: "w/price-list.jpg" },
        { workspaceId: directAutomation.workspaceId, automationId: directAutomation.id, slot: "MAIN", position: 1, kind: "VIDEO", mimeType: "video/mp4", sizeBytes: 5000, storageKey: "w/how-to.mp4" },
      ],
    });
    let before = calls.length;
    await webhookRoute(direct("media_person", "mid_media_1", { text: "PRICE please" }));
    // First pass: nothing sent, the reply waits 30 seconds as a delayed job.
    const first = state.jobs.shift()!;
    await state.processor!({ name: first.name, data: first.data, id: "job_first", attemptsMade: 0 });
    expect(sent(before)).toEqual([]);
    expect(state.jobs).toEqual([expect.objectContaining({ data: expect.objectContaining({ dmDelayed: true }), opts: expect.objectContaining({ delay: 30_000 }) })]);
    expect(await state.db.dmLog.findFirstOrThrow({ where: { commenterId: "media_person" } })).toMatchObject({ status: "PENDING" });

    before = calls.length;
    await runJobs();
    const posts = sent(before);
    expect(posts.map(pathOf)).toEqual([`/${IG_ID}/messages`, `/${IG_ID}/messages`, `/${IG_ID}/messages`]);
    expect(JSON.stringify(posts[0].body)).toContain("Here is our price list");
    const media = posts.slice(1).map((c) => JSON.stringify(c.body));
    expect(media[0]).toContain('"type":"image"');
    expect(media[0]).toContain(`${BASE}/media/w%2Fprice-list.jpg`);
    expect(media[1]).toContain('"type":"video"');
    expect(media[1]).toContain(`${BASE}/media/w%2Fhow-to.mp4`);
    expect(await state.db.dmLog.findFirstOrThrow({ where: { commenterId: "media_person" } })).toMatchObject({ status: "SENT" });
  });

  it("   the posts and reels list for choosing where an automation runs", async () => {
    const before = calls.length;
    const response = await postsRoute(new NextRequest(`${BASE}/api/instagram/posts`));
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain("reel_1");
    expect(calls.slice(before).map((c) => `${c.url.host}${pathOf(c)}`)).toContain("graph.instagram.com/me/media");
  });

  it("   the 60-day token is renewed by the daily routine", async () => {
    await state.db.instagramAccount.update({ where: { instagramId: IG_ID }, data: { tokenExpiresAt: new Date(Date.now() + 5 * 86_400_000) } });
    const before = calls.length;
    const results = await refreshExpiringTokens();
    expect(results).toEqual([expect.objectContaining({ username: "demo.store", status: "refreshed" })]);
    const call = calls.slice(before).find((c) => pathOf(c) === "/refresh_access_token")!;
    expect(call.url.host).toBe("graph.instagram.com");
    expect(call.url.searchParams.get("grant_type")).toBe("ig_refresh_token");
    expect(call.url.searchParams.get("access_token")).toBe(LONG_TOKEN);
    const row = await state.db.instagramAccount.findUniqueOrThrow({ where: { instagramId: IG_ID } });
    expect(decryptToken(row.accessToken)).toBe(RENEWED_TOKEN);
    expect(row.tokenExpiresAt!.getTime() - Date.now()).toBeGreaterThan(59 * 86_400_000);
  });

  it("   a forged webhook (signed with another secret) is refused and nothing is sent", async () => {
    const before = calls.length;
    const raw = JSON.stringify({ object: "instagram", entry: [{ id: IG_ID, time: 1, changes: [{ field: "comments", value: { id: "c_forged", text: "LINK", from: { id: "x" }, media: { id: "p" } } }] }] });
    const forged = new NextRequest(`${BASE}/api/webhook`, {
      method: "POST",
      body: raw,
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + createHmac("sha256", "another-app-secret").update(raw).digest("hex") },
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

  describe("6. an account from the old Facebook (Unified) login, as @primus3d_ today", () => {
    it("the migration marks it to reconnect; nothing is sent with its token", async () => {
      const workspace = await workspaceOf();
      const account = await state.db.instagramAccount.create({
        data: { workspaceId: workspace.id, instagramId: IG_ID, username: "demo.store", provider: "META", metaLogin: "UNIFIED", accessToken: "unreadable-system-user-token", metaLoginUserId: "122000000000777" },
      });
      await state.db.automation.create({
        data: { workspaceId: workspace.id, instagramAccountId: account.id, type: "COMMENTS", name: "Kept automation", keywords: ["LINK"], matchAnyPost: true, dmMessage: "Here it is", publicReplyEnabled: false },
      });
      await sql.query(readFileSync(path.join(__dirname, "..", "prisma", "migrations", "20261206120000_unified_accounts_reconnect", "migration.sql"), "utf8"));
      expect((await state.db.instagramAccount.findUniqueOrThrow({ where: { id: account.id } })).tokenInvalidAt).not.toBeNull();

      const before = calls.length;
      await webhookRoute(comment("comment_legacy", "fan_legacy"));
      await runJobs();
      expect(sent(before)).toEqual([]);
      expect(calls.slice(before).some((c) => c.url.host.includes("facebook"))).toBe(false);
    });

    it("reconnecting with Instagram updates the same account: automations kept, Instagram token, mark cleared", async () => {
      const account = await state.db.instagramAccount.findUniqueOrThrow({ where: { instagramId: IG_ID } });
      const { location } = await connect();
      expect(location).toBe(`${BASE}/accounts?instagram=connected`);
      const row = await state.db.instagramAccount.findUniqueOrThrow({ where: { instagramId: IG_ID } });
      expect(row).toMatchObject({ id: account.id, metaLogin: "INSTAGRAM", tokenInvalidAt: null, metaLoginUserId: null, instagramScopedId: SCOPED_ID });
      expect(decryptToken(row.accessToken)).toBe(LONG_TOKEN);
      expect(await state.db.automation.count({ where: { instagramAccountId: account.id, name: "Kept automation" } })).toBe(1);
    });

    it("Instagram's deauthorize callback (app removed in Instagram, app-scoped id) wipes the token", async () => {
      const forged = createSignedRequest({ algorithm: "HMAC-SHA256", user_id: SCOPED_ID }, "another-app-secret");
      expect((await deauthorizeRoute(formPost(`${BASE}/api/webhooks/meta/deauthorize`, forged))).status).toBe(400);
      expect((await state.db.instagramAccount.findUniqueOrThrow({ where: { instagramId: IG_ID } })).tokenInvalidAt).toBeNull();

      const signed = createSignedRequest({ algorithm: "HMAC-SHA256", user_id: SCOPED_ID, issued_at: 1 }, APP_SECRET);
      const response = await deauthorizeRoute(formPost(`${BASE}/api/webhooks/meta/deauthorize`, signed));
      expect(response.status).toBe(200);
      const row = await state.db.instagramAccount.findUniqueOrThrow({ where: { instagramId: IG_ID } });
      expect(row).toMatchObject({ accessToken: "", webhookSubscribed: false });
      expect(row.tokenInvalidAt).not.toBeNull();
    });

    it("Instagram's data deletion callback (professional account id) deletes the account and answers url + code", async () => {
      const signed = createSignedRequest({ algorithm: "HMAC-SHA256", user_id: IG_ID, issued_at: 1 }, APP_SECRET);
      const response = await dataDeletionRoute(formPost(`${BASE}/api/webhooks/meta/data-deletion`, signed));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Object.keys(body).sort()).toEqual(["confirmation_code", "url"]);
      expect(await state.db.instagramAccount.count()).toBe(0);
      expect(await state.db.automation.count()).toBe(0);
      expect(await state.db.dataDeletionRequest.findUniqueOrThrow({ where: { confirmationCode: body.confirmation_code } })).toMatchObject({ status: "COMPLETED", accountsDeleted: 1 });
    });
  });
});

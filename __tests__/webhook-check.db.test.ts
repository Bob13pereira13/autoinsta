/**
 * "Check notifications" (admin → client → Instagram accounts), on a real
 * Postgres: subscribes the account again with its own token
 * (POST /{ig-id}/subscribed_apps on graph.facebook.com, as Meta documents for
 * Unified login tokens), asks Meta what it confirms
 * (GET /{ig-id}/subscribed_apps) and answers it, with the same result in
 * Diagnostics. No Facebook Page is involved.
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
vi.mock("@/lib/admin/auth", () => ({ getAdminEmail: async () => "ops@empresa.test", adminForbidden: () => new Response(null, { status: 403 }) }));

import { POST } from "../app/api/admin/clients/[id]/accounts/[accountId]/webhooks/route";
import { encryptToken } from "../lib/meta/oauth";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `webhooks_${randomBytes(4).toString("hex")}`;
let sql: Client;
const fetchMock = vi.fn();
const calls = () => fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit | undefined)?.method ?? "GET"} ${new URL(String(url)).pathname.replace(/^\/v[\d.]+/, "")}`);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const check = (workspaceId: string, accountId: string) =>
  POST(new Request("https://app.test/x", { method: "POST" }), { params: Promise.resolve({ id: workspaceId, accountId }) });

describe.skipIf(!databaseUrl)("admin: check an account's notifications", () => {
  let accountId = "";
  beforeAll(async () => {
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("hex"));
    vi.stubEnv("META_APP_ID", "1234567890");
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    }
    state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
    await state.db.user.create({ data: { id: "u1", email: "dono@loja.test" } });
    await state.db.workspace.create({ data: { id: "w1", name: "Loja", ownerId: "u1" } });
    await state.db.workspace.create({ data: { id: "w2", name: "Outra", ownerId: "u1" } });
    const account = await state.db.instagramAccount.create({
      data: { workspaceId: "w1", instagramId: "17841400000000001", username: "primus3d_", accessToken: encryptToken("system-user-token"), metaLogin: "UNIFIED", webhookSubscribed: true },
    });
    accountId = account.id;
  }, 60_000);

  beforeEach(async () => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    await state.db.operationalEvent.deleteMany();
  });

  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("everything confirmed: subscribes on graph.facebook.com with the account's token and says so", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(json({ data: [{ id: "1234567890", name: "ChatIntegrAI", subscribed_fields: ["comments", "messages", "messaging_postbacks"] }] }));
    const res = await (await check("w1", accountId)).json();
    expect(res).toEqual({
      success: true,
      data: {
        ok: true,
        subscribed: true,
        requestedFields: ["comments", "messages", "messaging_postbacks"],
        confirmedFields: ["comments", "messages", "messaging_postbacks"],
        missing: [],
        subscribeError: null,
        checkError: null,
      },
    });
    expect(calls()).toEqual(["POST /17841400000000001/subscribed_apps", "GET /17841400000000001/subscribed_apps"]);
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("https://graph.facebook.com/"))).toBe(true);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer system-user-token" });
    const [event] = await state.db.operationalEvent.findMany();
    expect(event).toMatchObject({ level: "INFO", workspaceId: "w1", message: "Instagram notifications for @primus3d_: Meta confirms comments, messages, messaging_postbacks" });
  });

  it("messages not confirmed for this app (another app has them): the answer and Diagnostics name what is missing", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(json({ data: [{ id: "999", name: "Outro app", subscribed_fields: ["messages"] }, { id: "1234567890", subscribed_fields: ["comments"] }] }));
    const res = await (await check("w1", accountId)).json();
    expect(res.data).toMatchObject({ ok: false, subscribed: true, confirmedFields: ["comments"], missing: ["messages", "messaging_postbacks"] });
    const [event] = await state.db.operationalEvent.findMany();
    expect(event.level).toBe("WARNING");
    expect(event.payload).toMatchObject({ appsOnAccount: [{ id: "999", name: "Outro app", fields: ["messages"] }, { id: "1234567890", name: null, fields: ["comments"] }] });
  });

  it("Meta refuses the subscription: its error, and the account marked without notifications", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ error: { message: "(#200) Permissions error", type: "OAuthException", code: 200 } }, 403))
      .mockResolvedValueOnce(json({ data: [] }));
    const res = await (await check("w1", accountId)).json();
    expect(res.data).toMatchObject({ ok: false, subscribed: false, subscribeError: expect.stringContaining("(#200) Permissions error") });
    expect((await state.db.instagramAccount.findUniqueOrThrow({ where: { id: accountId } })).webhookSubscribed).toBe(false);
    expect((await state.db.operationalEvent.findMany())[0]).toMatchObject({ level: "ERROR", message: "Instagram notifications for @primus3d_: subscription failed" });
  });

  it("an access that cannot be read asks to reconnect, without calling Meta", async () => {
    const broken = await state.db.instagramAccount.create({ data: { workspaceId: "w1", instagramId: "17841400000000002", username: "quebrada", accessToken: "not-encrypted", metaLogin: "UNIFIED" } });
    const res = await check("w1", broken.id);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("The account's access could not be read. Reconnect the account.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("another client's account is not found", async () => {
    const res = await check("w2", accountId);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

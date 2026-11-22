/**
 * API v1 / MCP stay compatible after automations gained several posts:
 * `postId`/`postUrl` keep their meaning (the first marked post) and the new
 * `postIds` lists them all. Real Postgres; the service-key check is stubbed.
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({ db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient }));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/integrations/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/integrations/auth")>()),
  authenticateService: async () => ({ workspaceId: "w1", keyId: "key", scopes: ["campaigns:read"] }),
}));

import { GET } from "../app/api/v1/campaigns/route";
import { callTool } from "../lib/integrations/mcp";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `apiv1_${randomBytes(4).toString("hex")}`;
let sql: Client;
const context = { workspaceId: "w1", keyId: "key", scopes: ["campaigns:read"] };
const get = async (query = "") => {
  const res = await GET(new Request(`https://app.test/api/v1/campaigns${query}`, { headers: { authorization: "Bearer x" } }));
  expect(res.status).toBe(200);
  return (await res.json()).data;
};

describe.skipIf(!databaseUrl)("API v1 compatibility with several posts", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    }
    state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
    await state.db.user.create({ data: { id: "u1", email: "o@x.test" } });
    await state.db.workspace.create({ data: { id: "w1", name: "W", ownerId: "u1" } });
    await state.db.instagramAccount.create({ data: { id: "acc1", workspaceId: "w1", instagramId: "ig1", username: "loja", accessToken: "enc" } });
    const base = { workspaceId: "w1", instagramAccountId: "acc1", keywords: ["LINK"], dmMessage: "Oi" };
    // Written by older code: only the single postId, no post rows.
    await state.db.automation.create({ data: { ...base, id: "legacy", name: "Legacy", postId: "p_old", postUrl: "https://instagram.com/p/old", createdAt: new Date("2026-01-01") } });
    // Several marked posts; postId mirrors the first one.
    await state.db.automation.create({
      data: {
        ...base, id: "multi", name: "Multi", postId: "p1", postUrl: "https://instagram.com/p/1", createdAt: new Date("2026-01-02"),
        posts: { create: [{ postId: "p1", postUrl: "https://instagram.com/p/1", position: 0 }, { postId: "p2", position: 1 }, { postId: "p3", position: 2 }] },
      },
    });
    await state.db.automation.create({ data: { ...base, id: "any", name: "Any", matchAnyPost: true, createdAt: new Date("2026-01-03") } });
  }, 60_000);

  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  it("lists every old field plus postIds", async () => {
    const list = await get();
    const byId = Object.fromEntries(list.map((c: { id: string }) => [c.id, c]));
    expect(byId.legacy).toMatchObject({ postId: "p_old", postUrl: "https://instagram.com/p/old", matchAnyPost: false, pendingNextReel: false, postIds: ["p_old"] });
    expect(byId.multi).toMatchObject({ postId: "p1", postUrl: "https://instagram.com/p/1", postIds: ["p1", "p2", "p3"] });
    expect(byId.any).toMatchObject({ postId: null, matchAnyPost: true, postIds: [] });
    // The internal relation is not exposed under its own name.
    expect(byId.multi).not.toHaveProperty("posts");
    for (const field of ["id", "name", "goal", "type", "instagramAccountId", "isActive", "keywords", "matchAnyWord", "dmMessage", "createdAt", "updatedAt"]) {
      expect(byId.multi).toHaveProperty(field);
    }
  });

  it("returns postId and postIds in the detail, through the route and MCP alike", async () => {
    const detail = await get("?id=multi");
    expect(detail).toMatchObject({ postId: "p1", postIds: ["p1", "p2", "p3"], dmTriggerEnabled: false });
    expect(detail).toHaveProperty("replyToRecentComments", false);
    expect(JSON.parse(JSON.stringify(await callTool(context, "get_campaign", { id: "multi" })))).toEqual(detail);
  });

  it("keeps the type filter working", async () => {
    expect((await get("?type=DIRECT")).length).toBe(0);
    expect((await get("?type=comments")).map((c: { id: string }) => c.id)).toEqual(["any", "multi", "legacy"]);
  });
});

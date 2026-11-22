/**
 * Creating and editing automations with media through the API, on a real
 * Postgres and a temporary UPLOADS_DIR.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({ db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient }));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/auth", () => ({ getCurrentWorkspaceId: async () => "w1" }));
vi.mock("@/lib/workspace-access", () => ({
  getCurrentWorkspaceContext: async () => ({ userId: "u1", workspaceId: "w1", role: "OWNER" }),
  canManageWorkspace: () => true,
}));

import { POST, PATCH, GET } from "../app/api/automations/route";
import { storeUpload } from "../lib/media/storage";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `autoapi_${randomBytes(4).toString("hex")}`;
let sql: Client;
let uploads: string;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(500)]);

const req = (method: string, body: unknown, query = "") =>
  new NextRequest(`https://app.test/api/automations${query}`, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe.skipIf(!databaseUrl)("automations API with channels and media", () => {
  beforeAll(async () => {
    uploads = mkdtempSync(path.join(tmpdir(), "uploads-api-"));
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
    state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
    await state.db.user.create({ data: { id: "u1", email: "o@x.test" } });
    await state.db.workspace.create({ data: { id: "w1", name: "W", ownerId: "u1" } });
    await state.db.workspace.create({ data: { id: "w2", name: "Other", ownerId: "u1" } });
    await state.db.instagramAccount.create({ data: { id: "acc1", workspaceId: "w1", instagramId: "ig1", username: "loja", accessToken: "enc" } });
  }, 60_000);

  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
    rmSync(uploads, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("creates a Direct automation with an image in the main message", async () => {
    const image = await storeUpload({ workspaceId: "w1", buffer: JPEG });
    const res = await POST(req("POST", {
      name: "Boas-vindas", type: "DIRECT", matchAnyWord: true, replyCooldownHours: 12,
      dmMessage: "Oi! Veja nosso catálogo", media: [{ id: image.id, slot: "MAIN" }],
      // Comment-only options sent by mistake are cleared.
      matchAnyPost: true, publicReplyEnabled: true, publicReplyMessages: ["x"], dmTriggerEnabled: true,
    }));
    expect(res.status).toBe(201);
    const created = (await res.json()).data;
    const row = await state.db.automation.findUniqueOrThrow({ where: { id: created.id }, include: { media: true } });
    expect(row).toMatchObject({ type: "DIRECT", replyCooldownHours: 12, matchAnyPost: false, publicReplyEnabled: false, dmTriggerEnabled: false });
    expect(row.media.map((m) => [m.slot, m.kind])).toEqual([["MAIN", "IMAGE"]]);

    const list = (await (await GET(new NextRequest("https://app.test/api/automations"))).json()).data;
    const listed = list.find((a: { id: string }) => a.id === created.id);
    expect(listed.media[0].url).toMatch(/^https:\/\/app\.test\/media\//);
    expect(listed.media[0].storageKey).toBeUndefined();
  });

  it("refuses media in a Comments automation with no step (Direct)", async () => {
    const image = await storeUpload({ workspaceId: "w1", buffer: JPEG });
    const res = await POST(req("POST", {
      name: "Post", type: "COMMENTS", matchAnyPost: true, keywords: ["LINK"], dmMessage: "Aqui", media: [{ id: image.id, slot: "MAIN" }],
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/With steps first/);
  });

  it("refuses media that belongs to another workspace", async () => {
    const foreign = await storeUpload({ workspaceId: "w2", buffer: JPEG });
    const res = await POST(req("POST", { name: "X", type: "DIRECT", matchAnyWord: true, dmMessage: "Oi", media: [{ id: foreign.id, slot: "MAIN" }] }));
    expect(res.status).toBe(400);
  });

  it("removing media in the editor deletes the file; pausing never re-validates", async () => {
    const image = await storeUpload({ workspaceId: "w1", buffer: JPEG });
    const created = (await (await POST(req("POST", { name: "Y", type: "DIRECT", keywords: ["preço"], dmMessage: "Tabela", media: [{ id: image.id, slot: "MAIN" }] }))).json()).data;
    expect(existsSync(path.join(uploads, image.storageKey))).toBe(true);

    const patched = await PATCH(req("PATCH", { media: [] }, `?id=${created.id}`));
    expect(patched.status).toBe(200);
    expect(existsSync(path.join(uploads, image.storageKey))).toBe(false);

    const paused = await PATCH(req("PATCH", { isActive: false }, `?id=${created.id}`));
    expect(paused.status).toBe(200);
  });

  describe("several posts", () => {
    const rowsOf = (id: string) =>
      state.db.automationPost.findMany({ where: { automationId: id }, orderBy: { position: "asc" } });

    it("creates with a list of posts; postId mirrors the first", async () => {
      const res = await POST(req("POST", {
        name: "Multi", type: "COMMENTS", keywords: ["LINK"], dmMessage: "Oi",
        posts: [
          { id: "p1", url: "https://instagram.com/p/1", publishedAt: "2026-11-01T10:00:00Z" },
          { id: "p2", url: "https://instagram.com/p/2" },
          { id: "p1" },
        ],
        // A list wins over the all-posts flag.
        matchAnyPost: true,
      }));
      expect(res.status).toBe(201);
      const created = (await res.json()).data;
      const row = await state.db.automation.findUniqueOrThrow({ where: { id: created.id } });
      expect(row).toMatchObject({ postId: "p1", postUrl: "https://instagram.com/p/1", matchAnyPost: false, pendingNextReel: false, replyToRecentComments: false });
      expect((await rowsOf(created.id)).map((p) => [p.postId, p.postUrl, p.position])).toEqual([
        ["p1", "https://instagram.com/p/1", 0],
        ["p2", "https://instagram.com/p/2", 1],
      ]);
      expect((await rowsOf(created.id))[0].publishedAt?.toISOString()).toBe("2026-11-01T10:00:00.000Z");
      const listed = (await (await GET(new NextRequest("https://app.test/api/automations"))).json()).data.find((a: { id: string }) => a.id === created.id);
      expect(listed.postIds).toEqual(["p1", "p2"]);
    });

    it("creates with posts exactly as the editor sends them (no matchAnyPost)", async () => {
      const res = await POST(req("POST", {
        name: "Editor", type: "COMMENTS", keywords: ["CUPOM"], dmMessage: "Oi",
        posts: [{ id: "ed1", url: "https://instagram.com/p/ed1", publishedAt: null }, { id: "ed2", url: null, publishedAt: null }],
        matchAnyPost: false, pendingNextReel: false, replyToRecentComments: true,
      }));
      expect(res.status).toBe(201);
      const created = (await res.json()).data;
      expect((await rowsOf(created.id)).map((p) => p.postId)).toEqual(["ed1", "ed2"]);
      expect(created).toMatchObject({ postId: "ed1", matchAnyPost: false, replyToRecentComments: true });
    });

    it("accepts plain postIds and the legacy single postId", async () => {
      const a = (await (await POST(req("POST", { name: "Ids", keywords: ["A"], dmMessage: "Oi", postIds: ["x1", "x2", "x3"] }))).json()).data;
      expect((await rowsOf(a.id)).map((p) => p.postId)).toEqual(["x1", "x2", "x3"]);
      const b = (await (await POST(req("POST", { name: "Legacy", keywords: ["A"], dmMessage: "Oi", postId: "solo", postUrl: "https://instagram.com/p/solo" }))).json()).data;
      expect((await rowsOf(b.id)).map((p) => [p.postId, p.postUrl])).toEqual([["solo", "https://instagram.com/p/solo"]]);
      expect(b.postId).toBe("solo");
    });

    it("refuses more than 100 posts and an empty specific selection", async () => {
      const many = Array.from({ length: 101 }, (_, i) => `m${i}`);
      const res = await POST(req("POST", { name: "Too many", keywords: ["A"], dmMessage: "Oi", postIds: many }));
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).toMatch(/Up to 100 posts per automation/);
      expect((await POST(req("POST", { name: "Nothing", keywords: ["A"], dmMessage: "Oi", postIds: [] }))).status).toBe(400);
      const hundred = Array.from({ length: 100 }, (_, i) => `h${i}`);
      expect((await POST(req("POST", { name: "Hundred", keywords: ["A"], dmMessage: "Oi", postIds: hundred }))).status).toBe(201);
    });

    it("editing the selection rewrites the rows and keeps postId in sync; all posts clears them", async () => {
      const created = (await (await POST(req("POST", { name: "Edit", keywords: ["A"], dmMessage: "Oi", postIds: ["e1", "e2"] }))).json()).data;
      let res = await PATCH(req("PATCH", { posts: [{ id: "e3", url: "https://instagram.com/p/e3" }, { id: "e1" }] }, `?id=${created.id}`));
      expect(res.status).toBe(200);
      expect((await res.json()).data.postId).toBe("e3");
      expect((await rowsOf(created.id)).map((p) => p.postId)).toEqual(["e3", "e1"]);
      expect((await state.db.automation.findUniqueOrThrow({ where: { id: created.id } })).postUrl).toBe("https://instagram.com/p/e3");

      res = await PATCH(req("PATCH", { matchAnyPost: true }, `?id=${created.id}`));
      expect(res.status).toBe(200);
      expect(await rowsOf(created.id)).toEqual([]);
      expect(await state.db.automation.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ postId: null, postUrl: null, matchAnyPost: true });

      // Renaming or pausing leaves the posts alone.
      await PATCH(req("PATCH", { postIds: ["e9"], matchAnyPost: false }, `?id=${created.id}`));
      await PATCH(req("PATCH", { name: "Renamed", isActive: false }, `?id=${created.id}`));
      expect((await rowsOf(created.id)).map((p) => p.postId)).toEqual(["e9"]);
    });

    it("Direct and Stories automations never keep posts", async () => {
      const created = (await (await POST(req("POST", { name: "D", type: "DIRECT", keywords: ["A"], dmMessage: "Oi", postIds: ["d1"] }))).json()).data;
      expect(await rowsOf(created.id)).toEqual([]);
      const comments = (await (await POST(req("POST", { name: "C", keywords: ["A"], dmMessage: "Oi", postIds: ["c1"] }))).json()).data;
      await PATCH(req("PATCH", { type: "DIRECT" }, `?id=${comments.id}`));
      expect(await rowsOf(comments.id)).toEqual([]);
      expect((await state.db.automation.findUniqueOrThrow({ where: { id: comments.id } })).postId).toBeNull();
    });
  });

  describe("activation", () => {
    it("activeSince is set on creation and moves forward only when the automation is resumed", async () => {
      const t0 = Date.now();
      const created = (await (await POST(req("POST", { name: "Act", keywords: ["A"], dmMessage: "Oi", matchAnyPost: true }))).json()).data;
      const first = (await state.db.automation.findUniqueOrThrow({ where: { id: created.id } })).activeSince;
      expect(first.getTime()).toBeGreaterThanOrEqual(t0 - 1000);

      await PATCH(req("PATCH", { isActive: false }, `?id=${created.id}`));
      await PATCH(req("PATCH", { name: "Still paused" }, `?id=${created.id}`));
      expect((await state.db.automation.findUniqueOrThrow({ where: { id: created.id } })).activeSince).toEqual(first);

      await new Promise((r) => setTimeout(r, 20));
      await PATCH(req("PATCH", { isActive: true }, `?id=${created.id}`));
      const resumed = (await state.db.automation.findUniqueOrThrow({ where: { id: created.id } })).activeSince;
      expect(resumed.getTime()).toBeGreaterThan(first.getTime());

      // Saving an active automation does not move it.
      await PATCH(req("PATCH", { isActive: true, name: "Again" }, `?id=${created.id}`));
      expect((await state.db.automation.findUniqueOrThrow({ where: { id: created.id } })).activeSince).toEqual(resumed);
    });

    it("stores the 72h option for Comments only", async () => {
      const c = (await (await POST(req("POST", { name: "Rec", keywords: ["A"], dmMessage: "Oi", matchAnyPost: true, replyToRecentComments: true }))).json()).data;
      expect(c.replyToRecentComments).toBe(true);
      const d = (await (await POST(req("POST", { name: "RecD", type: "DIRECT", keywords: ["A"], dmMessage: "Oi", replyToRecentComments: true }))).json()).data;
      expect(d.replyToRecentComments).toBe(false);
    });
  });

  it("Stories: mentions only without keywords", async () => {
    const bad = await POST(req("POST", { name: "S", type: "STORIES", keywords: ["LINK"], triggerStoryMentions: true, dmMessage: "Oi" }));
    expect(bad.status).toBe(400);
    const ok = await POST(req("POST", { name: "S2", type: "STORIES", matchAnyWord: true, triggerStoryReplies: false, triggerStoryMentions: true, dmMessage: "Obrigado pela marcação!" }));
    expect(ok.status).toBe(201);
  });
});

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

  it("refuses media in a Comments automation without the opening DM", async () => {
    const image = await storeUpload({ workspaceId: "w1", buffer: JPEG });
    const res = await POST(req("POST", {
      name: "Post", type: "COMMENTS", matchAnyPost: true, keywords: ["LINK"], dmMessage: "Aqui", media: [{ id: image.id, slot: "MAIN" }],
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/opening DM/);
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

  it("Stories: mentions only without keywords", async () => {
    const bad = await POST(req("POST", { name: "S", type: "STORIES", keywords: ["LINK"], triggerStoryMentions: true, dmMessage: "Oi" }));
    expect(bad.status).toBe(400);
    const ok = await POST(req("POST", { name: "S2", type: "STORIES", matchAnyWord: true, triggerStoryReplies: false, triggerStoryMentions: true, dmMessage: "Obrigado pela marcação!" }));
    expect(ok.status).toBe(201);
  });
});

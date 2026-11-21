/**
 * Media uploads end to end against a real Postgres and a temporary UPLOADS_DIR.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
 *     npx vitest run __tests__/media.db.test.ts
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
  context: null as null | { userId: string; workspaceId: string; role: "OWNER" | "ADMIN" | "MEMBER" },
}));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/workspace-access", () => ({
  getCurrentWorkspaceContext: async () => state.context,
  canManageWorkspace: (role: string) => role === "OWNER" || role === "ADMIN",
}));

import { mediaKeysForAccounts, purgeStaleMedia, storeUpload, workspaceMediaUsageBytes } from "../lib/media/storage";
import { handleMetaDataDeletion } from "../lib/privacy/data-deletion";
import { POST as upload, GET as usage } from "../app/api/media/route";
import { GET as serve } from "../app/media/[key]/route";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `media_${randomBytes(4).toString("hex")}`;
let sql: Client;
let uploads: string;

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(2000)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom", "latin1"), randomBytes(4000)]);

function uploadRequest(buffer: Buffer, name: string, type = "image/jpeg") {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type }), name);
  return new NextRequest("https://app.test/api/media", { method: "POST", body: form });
}

describe.skipIf(!databaseUrl)("media storage on real PostgreSQL", () => {
  beforeAll(async () => {
    uploads = mkdtempSync(path.join(tmpdir(), "uploads-"));
    vi.stubEnv("UPLOADS_DIR", path.join(uploads, "nested", "dir"));
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
    for (const w of ["w1", "w2"]) await state.db.workspace.create({ data: { id: w, name: w, ownerId: "u1" } });
    await state.db.instagramAccount.create({ data: { id: "acc1", workspaceId: "w1", instagramId: "ig1", username: "loja", accessToken: "enc" } });
    await state.db.automation.create({ data: { id: "auto1", workspaceId: "w1", instagramAccountId: "acc1", name: "A", type: "DIRECT", dmMessage: "Oi" } });
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

  beforeEach(() => {
    state.context = { userId: "u1", workspaceId: "w1", role: "OWNER" };
    vi.stubEnv("MEDIA_WORKSPACE_QUOTA_MB", "500");
  });

  const dir = () => path.join(uploads, "nested", "dir");

  it("creates UPLOADS_DIR on first upload and serves the file publicly", async () => {
    const res = await upload(uploadRequest(JPEG, "foto.jpg"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ kind: "IMAGE", mimeType: "image/jpeg", sizeBytes: JPEG.length, originalName: "foto.jpg" });
    expect(body.data.url).toMatch(/^https:\/\/app\.test\/media\/[A-Za-z0-9_-]{43}\.jpg$/);
    expect(existsSync(dir())).toBe(true);

    const key = body.data.url.split("/").pop();
    const served = await serve(new Request(body.data.url), { params: Promise.resolve({ key }) });
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await served.arrayBuffer()).equals(JPEG)).toBe(true);
  });

  it("supports Range requests for video", async () => {
    const res = await upload(uploadRequest(MP4, "video.mp4", "video/mp4"));
    const key = (await res.json()).data.url.split("/").pop();
    const part = await serve(new Request("https://app.test/media/" + key, { headers: { range: "bytes=0-99" } }), { params: Promise.resolve({ key }) });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 0-99/${MP4.length}`);
    expect((await part.arrayBuffer()).byteLength).toBe(100);
  });

  it("validates on the server: content, not the name or the declared type", async () => {
    const fake = await upload(uploadRequest(Buffer.from("<?php echo 1; ?>"), "foto.jpg", "image/jpeg"));
    expect(fake.status).toBe(415);
    expect((await fake.json()).code).toBe("unsupported_type");
    const big = await upload(uploadRequest(Buffer.concat([JPEG, Buffer.alloc(8 * 1024 * 1024)]), "grande.jpg"));
    expect(big.status).toBe(413);
    expect((await big.json()).code).toBe("image_too_large");
  });

  it("refuses uploads without a session or from members without permission", async () => {
    state.context = null;
    expect((await upload(uploadRequest(JPEG, "x.jpg"))).status).toBe(401);
    state.context = { userId: "u1", workspaceId: "w1", role: "MEMBER" };
    expect((await upload(uploadRequest(JPEG, "x.jpg"))).status).toBe(403);
  });

  it("enforces the per-workspace quota with a clear message, and reports usage", async () => {
    vi.stubEnv("MEDIA_WORKSPACE_QUOTA_MB", "0.005"); // ~5 KB
    const res = await upload(uploadRequest(MP4, "outro.mp4", "video/mp4"));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.code).toBe("quota_exceeded");
    expect(body.error).toMatch(/storage is full/);
    const u = await (await usage()).json();
    expect(u.data.usedBytes).toBe(await workspaceMediaUsageBytes("w1"));
    // Another workspace has its own quota.
    expect(await workspaceMediaUsageBytes("w2")).toBe(0);
  });

  it("does not serve a file whose record is gone, nor keys that were never issued", async () => {
    const orphan = "b".repeat(43) + ".jpg";
    writeFileSync(path.join(dir(), orphan), JPEG);
    expect((await serve(new Request("https://app.test/media/" + orphan), { params: Promise.resolve({ key: orphan }) })).status).toBe(404);
    expect((await serve(new Request("https://app.test/media/x"), { params: Promise.resolve({ key: "../../etc/passwd" }) })).status).toBe(404);
  });

  it("purges unattached uploads after 24h and orphan files after an hour", async () => {
    const old = await storeUpload({ workspaceId: "w1", buffer: JPEG, originalName: "abandonada.jpg" });
    await state.db.automationMedia.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
    const orphan = "c".repeat(43) + ".jpg";
    writeFileSync(path.join(dir(), orphan), JPEG);
    const hourAgo = new Date(Date.now() - 2 * 3600_000);
    utimesSync(path.join(dir(), orphan), hourAgo, hourAgo);

    const result = await purgeStaleMedia();
    expect(result.unattached).toBeGreaterThanOrEqual(1);
    expect(existsSync(path.join(dir(), old.storageKey))).toBe(false);
    expect(existsSync(path.join(dir(), orphan))).toBe(false);
  });

  it("removes an account's media files on a Meta data deletion request", async () => {
    const attached = await storeUpload({ workspaceId: "w1", buffer: JPEG });
    await state.db.automationMedia.update({ where: { id: attached.id }, data: { automationId: "auto1", slot: "MAIN" } });
    await state.db.botMessage.create({ data: { mid: "bot1", instagramId: "ig1" } });
    expect(await mediaKeysForAccounts(["acc1"])).toContain(attached.storageKey);

    await handleMetaDataDeletion("ig1");

    expect(existsSync(path.join(dir(), attached.storageKey))).toBe(false);
    expect(await state.db.automationMedia.count({ where: { id: attached.id } })).toBe(0);
    expect(await state.db.botMessage.count({ where: { instagramId: "ig1" } })).toBe(0);
  });
});

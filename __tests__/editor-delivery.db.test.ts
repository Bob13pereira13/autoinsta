/**
 * Step 3 on a real Postgres: "Direct" saves with both steps off; media in a
 * Comments automation with no step is refused by the API (allowed with the
 * opening DM or the follow request); the wait before the DM only takes the
 * offered values and defaults to 0; the migration gives every existing
 * automation 0 (unchanged); and the team-reply check used by a delayed DM.
 */
import { randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
  redisList: new Map<string, string[]>(),
}));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/auth", () => ({ getCurrentWorkspaceId: async () => "w1" }));
vi.mock("@/lib/workspace-access", () => ({
  getCurrentWorkspaceContext: async () => ({ userId: "u1", workspaceId: "w1", role: "OWNER" }),
  canManageWorkspace: () => true,
}));
// A tiny in-memory Redis for the echo notes.
vi.mock("@/lib/queue/client", async (orig) => ({
  ...(await orig<typeof import("../lib/queue/client")>()),
  getRedisConnection: () => ({
    lpush: async (k: string, v: string) => state.redisList.set(k, [v, ...(state.redisList.get(k) ?? [])]).size,
    ltrim: async () => "OK",
    expire: async () => 1,
    lrange: async (k: string) => state.redisList.get(k) ?? [],
  }),
}));

import { POST, PATCH } from "../app/api/automations/route";
import { storeUpload } from "../lib/media/storage";
import { humanRepliedSince, noteEcho, recordBotMessage, recordHumanMessage } from "../lib/automation/guards";
import { RULE_MESSAGES } from "../lib/automation/rules";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `delivery_${randomBytes(4).toString("hex")}`;
const DELAY_MIGRATION = "20261202120000_dm_delay";
let sql: Client;
let uploads: string;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(400)]);

const req = (method: string, body: unknown, query = "") =>
  new NextRequest(`https://app.test/api/automations${query}`, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const comments = (over: Record<string, unknown> = {}) => ({
  name: "Catálogo", type: "COMMENTS", instagramAccountId: "acc1", keywords: ["LINK"], matchAnyPost: true,
  dmMessage: "Aqui está: {link}", trackedDestinationUrl: "https://loja.test", ...over,
});

describe.skipIf(!databaseUrl)("step 3: Direct or steps, media, wait before the DM", () => {
  beforeAll(async () => {
    uploads = mkdtempSync(path.join(tmpdir(), "uploads-delivery-"));
    vi.stubEnv("UPLOADS_DIR", uploads);
    vi.stubEnv("NEXTAUTH_URL", "https://app.test");
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    // Up to just before the wait migration, with an automation that exists then.
    for (const dir of dirs.filter((d) => d.name < DELAY_MIGRATION)) await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    await sql.query(`INSERT INTO "User" ("id", "email", "updatedAt") VALUES ('u1', 'o@x.test', now())`);
    await sql.query(`INSERT INTO "Workspace" ("id", "name", "ownerId", "updatedAt") VALUES ('w1', 'W', 'u1', now())`);
    await sql.query(`INSERT INTO "InstagramAccount" ("id", "workspaceId", "instagramId", "username", "accessToken", "updatedAt") VALUES ('acc1', 'w1', 'ig1', 'loja', 'enc', now())`);
    await sql.query(`INSERT INTO "Automation" ("id", "workspaceId", "instagramAccountId", "name", "keywords", "dmMessage", "matchAnyPost", "updatedAt")
      VALUES ('old_auto', 'w1', 'acc1', 'Antiga', '{LINK}', 'Oi', true, now())`);
    for (const dir of dirs.filter((d) => d.name >= DELAY_MIGRATION)) await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
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

  it("the migration leaves existing automations without a wait (0)", async () => {
    const row = await state.db.automation.findUniqueOrThrow({ where: { id: "old_auto" } });
    expect(row.dmDelaySeconds).toBe(0);
  });

  it("Direct saves with both steps off; a new automation waits 30 seconds unless it says otherwise", async () => {
    const res = await POST(req("POST", comments({ openingDmEnabled: false, requireFollow: false })));
    expect(res.status).toBe(201);
    const row = await state.db.automation.findUniqueOrThrow({ where: { id: (await res.json()).data.id } });
    expect(row).toMatchObject({ openingDmEnabled: false, requireFollow: false, dmDelaySeconds: 30 });
    const now = await POST(req("POST", comments({ name: "Na hora", dmDelaySeconds: 0 })));
    expect((await state.db.automation.findUniqueOrThrow({ where: { id: (await now.json()).data.id } })).dmDelaySeconds).toBe(0);
  });

  it("an existing automation keeps its saved wait when edited without it", async () => {
    expect((await PATCH(req("PATCH", { name: "Antiga editada" }, "?id=old_auto"))).status).toBe(200);
    expect((await state.db.automation.findUniqueOrThrow({ where: { id: "old_auto" } })).dmDelaySeconds).toBe(0);
  });

  it("the log takes the new “comment deleted” status and the reason a public reply was not posted", async () => {
    const log = await state.db.dmLog.create({
      data: {
        workspaceId: "w1", automationId: "old_auto", instagramAccountId: "acc1", commenterId: "p1", commentText: "LINK", commentId: "c_gone",
        status: "SKIPPED_COMMENT_DELETED", errorMessage: "Not sent: the comment was deleted during the wait", publicReplySkipReason: "comment_deleted",
      },
    });
    expect(log).toMatchObject({ status: "SKIPPED_COMMENT_DELETED", publicReplySkipReason: "comment_deleted", publicReplySentAt: null });
  });

  it("the wait takes only 0, 30, 60 or 300 seconds", async () => {
    const ok = await POST(req("POST", comments({ name: "Espera", dmDelaySeconds: 30 })));
    expect(ok.status).toBe(201);
    const id = (await ok.json()).data.id;
    expect((await state.db.automation.findUniqueOrThrow({ where: { id } })).dmDelaySeconds).toBe(30);
    expect((await PATCH(req("PATCH", { dmDelaySeconds: 300 }, `?id=${id}`))).status).toBe(200);
    expect((await state.db.automation.findUniqueOrThrow({ where: { id } })).dmDelaySeconds).toBe(300);
    expect((await POST(req("POST", comments({ name: "Inválida", dmDelaySeconds: 45 })))).status).toBe(400);
    expect((await PATCH(req("PATCH", { dmDelaySeconds: -1 }, `?id=${id}`))).status).toBe(400);
  });

  it("Comments in Direct: media is refused, with the explanation", async () => {
    const image = await storeUpload({ workspaceId: "w1", buffer: JPEG });
    const res = await POST(req("POST", comments({ name: "Com foto", media: [{ id: image.id, slot: "MAIN" }] })));
    expect(res.status).toBe(400);
    expect((await res.json()).details.fieldErrors.media[0]).toBe(RULE_MESSAGES.commentsMediaNeedsOpening);
  });

  it("Comments with a step: media goes after the tap, so it is accepted", async () => {
    const a = await storeUpload({ workspaceId: "w1", buffer: JPEG });
    const withOpening = await POST(req("POST", comments({
      name: "Abertura", openingDmEnabled: true, openingDmMessage: "Quer o link?", openingDmButtonLabel: "Quero", media: [{ id: a.id, slot: "MAIN" }],
    })));
    expect(withOpening.status).toBe(201);
    const b = await storeUpload({ workspaceId: "w1", buffer: JPEG });
    const withFollow = await POST(req("POST", comments({ name: "Seguir", requireFollow: true, media: [{ id: b.id, slot: "MAIN" }] })));
    expect(withFollow.status).toBe(201);
    // But not on the follow request itself without the opening DM (it is the text-only reply).
    const c = await storeUpload({ workspaceId: "w1", buffer: JPEG });
    const promptMedia = await POST(req("POST", comments({ name: "Pedido com foto", requireFollow: true, media: [{ id: c.id, slot: "FOLLOW_PROMPT" }] })));
    expect(promptMedia.status).toBe(400);
    expect((await promptMedia.json()).details.fieldErrors["media.FOLLOW_PROMPT"][0]).toBe(RULE_MESSAGES.followPromptMediaNeedsOpening);
  });

  it("Stories and Direct in Direct mode send media without any step", async () => {
    const image = await storeUpload({ workspaceId: "w1", buffer: JPEG });
    const res = await POST(req("POST", { name: "Boas-vindas", type: "DIRECT", instagramAccountId: "acc1", matchAnyWord: true, dmMessage: "Oi!", media: [{ id: image.id, slot: "MAIN" }] }));
    expect(res.status).toBe(201);
  });

  describe("a team reply during the wait", () => {
    const since = new Date(Date.now() - 30_000);
    it("none: false", async () => {
      expect(await humanRepliedSince({ accountConnectionId: "acc1", recipientId: "p0", since })).toBe(false);
    });

    it("classified echo after the wait started: true; before it: false", async () => {
      await recordHumanMessage({ accountConnectionId: "acc1", recipientId: "p1", at: new Date() });
      expect(await humanRepliedSince({ accountConnectionId: "acc1", recipientId: "p1", since })).toBe(true);
      await recordHumanMessage({ accountConnectionId: "acc1", recipientId: "p2", at: new Date(Date.now() - 120_000) });
      expect(await humanRepliedSince({ accountConnectionId: "acc1", recipientId: "p2", since })).toBe(false);
    });

    it("an echo just arrived (not classified yet) counts unless it is the bot's own message", async () => {
      await noteEcho({ accountConnectionId: "acc1", recipientId: "p3", messageId: "mid_team" });
      expect(await humanRepliedSince({ accountConnectionId: "acc1", recipientId: "p3", since })).toBe(true);
      await recordBotMessage({ messageId: "mid_bot", instagramId: "ig1", recipientId: "p4" });
      await noteEcho({ accountConnectionId: "acc1", recipientId: "p4", messageId: "mid_bot" });
      expect(await humanRepliedSince({ accountConnectionId: "acc1", recipientId: "p4", since })).toBe(false);
      // Noted before the wait started: not this wait.
      await noteEcho({ accountConnectionId: "acc1", recipientId: "p5", messageId: "mid_old", at: new Date(Date.now() - 120_000) });
      expect(await humanRepliedSince({ accountConnectionId: "acc1", recipientId: "p5", since })).toBe(false);
    });
  });
});

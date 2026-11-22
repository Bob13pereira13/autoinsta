/**
 * The migration that added the Accounts switch and multi-post Comments
 * automations, against a real Postgres: seeds the old shape, applies it,
 * checks the result.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
 *     npx vitest run __tests__/accounts-multi-posts-migration.db.test.ts
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `multipost_${randomBytes(4).toString("hex")}`;
const MIGRATION = "20261123120000_accounts_toggle_multi_posts";
const root = path.join(__dirname, "..", "prisma", "migrations");
let sql: Client;

describe.skipIf(!databaseUrl)("accounts switch + multi-post migration", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const dirs = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name < MIGRATION)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));

    await sql.query(`INSERT INTO "User" (id, email, "updatedAt") VALUES ('u1', 'o@x.test', now())`);
    await sql.query(`INSERT INTO "Workspace" (id, name, "ownerId", "updatedAt") VALUES ('w1', 'W', 'u1', now())`);
    await sql.query(`INSERT INTO "InstagramAccount" (id, "workspaceId", "instagramId", username, "accessToken", "updatedAt") VALUES ('a1', 'w1', 'ig1', 'loja', 'enc', now())`);
    // One automation bound to a post, one on any post, one waiting for the next reel, one Direct.
    await sql.query(`INSERT INTO "Automation" (id, "workspaceId", "instagramAccountId", name, type, "postId", "postUrl", "matchAnyPost", "pendingNextReel", keywords, "dmMessage", "createdAt", "updatedAt") VALUES
      ('single', 'w1', 'a1', 'Um post', 'COMMENTS', 'media_1', 'https://instagram.com/p/abc', false, false, ARRAY['LINK'], 'Oi', '2026-03-01T10:00:00Z', now()),
      ('anypost', 'w1', 'a1', 'Todos', 'COMMENTS', NULL, NULL, true, false, ARRAY['LINK'], 'Oi', '2026-03-02T10:00:00Z', now()),
      ('nextreel', 'w1', 'a1', 'Próximo', 'COMMENTS', NULL, NULL, false, true, ARRAY['LINK'], 'Oi', '2026-03-03T10:00:00Z', now()),
      ('direct', 'w1', 'a1', 'DM', 'DIRECT', NULL, NULL, false, false, ARRAY['OI'], 'Oi', '2026-03-04T10:00:00Z', now())`);

    await sql.query(readFileSync(path.join(root, MIGRATION, "migration.sql"), "utf8"));
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  it("copies the single postId into the post list and keeps postId", async () => {
    const { rows } = await sql.query(`SELECT "automationId", "postId", "postUrl", position FROM "AutomationPost" ORDER BY "automationId"`);
    expect(rows).toEqual([{ automationId: "single", postId: "media_1", postUrl: "https://instagram.com/p/abc", position: 0 }]);
    const { rows: kept } = await sql.query(`SELECT "postId", "postUrl" FROM "Automation" WHERE id = 'single'`);
    expect(kept[0]).toEqual({ postId: "media_1", postUrl: "https://instagram.com/p/abc" });
  });

  it("leaves any-post, next-reel and Direct automations without posts", async () => {
    const { rows } = await sql.query(`SELECT count(*)::int AS n FROM "AutomationPost" WHERE "automationId" <> 'single'`);
    expect(rows[0].n).toBe(0);
  });

  it("fills activeSince with createdAt and leaves recent-comment replies off", async () => {
    const { rows } = await sql.query(`SELECT id, "activeSince", "createdAt", "replyToRecentComments" FROM "Automation" ORDER BY id`);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.activeSince.toISOString()).toBe(row.createdAt.toISOString());
      expect(row.replyToRecentComments).toBe(false);
    }
  });

  it("keeps every account active, with no reactivation date", async () => {
    const { rows } = await sql.query(`SELECT "automationsEnabled", "automationsResumedAt" FROM "InstagramAccount"`);
    expect(rows).toEqual([{ automationsEnabled: true, automationsResumedAt: null }]);
  });

  it("deletes an automation's post rows with it", async () => {
    await sql.query(`DELETE FROM "Automation" WHERE id = 'single'`);
    const { rows } = await sql.query(`SELECT count(*)::int AS n FROM "AutomationPost"`);
    expect(rows[0].n).toBe(0);
  });
});

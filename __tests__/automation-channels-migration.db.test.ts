/**
 * The migration that split automations by channel, against a real Postgres:
 * seeds data in the old shape, applies the migration, checks the result.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
 *     npx vitest run __tests__/automation-channels-migration.db.test.ts
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `channels_${randomBytes(4).toString("hex")}`;
const MIGRATION = "20261122120000_automation_channels_media";
const root = path.join(__dirname, "..", "prisma", "migrations");
let sql: Client;

describe.skipIf(!databaseUrl)("automation channels migration", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const dirs = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name < MIGRATION)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));

    // Old shape: one comment campaign that also answered DMs, one that did not.
    await sql.query(`INSERT INTO "User" (id, email, "updatedAt") VALUES ('u1', 'o@x.test', now())`);
    await sql.query(`INSERT INTO "Workspace" (id, name, "ownerId", "updatedAt") VALUES ('w1', 'W', 'u1', now())`);
    await sql.query(`INSERT INTO "InstagramAccount" (id, "workspaceId", "instagramId", username, "accessToken", "updatedAt") VALUES ('a1', 'w1', 'ig1', 'loja', 'enc', now())`);
    await sql.query(`INSERT INTO "Automation" (id, "workspaceId", "instagramAccountId", name, "postId", keywords, "matchAnyWord", "dmTriggerEnabled", "dmMessage",
        "openingDmEnabled", "openingDmMessage", "openingDmButtonLabel", "requireFollow", "followPromptMessage", "followUpEnabled", "followUpMessage", "followUpDelayMinutes",
        "publicReplyEnabled", "publicReplyMessages", "wholeWordMatch", "createdAt", "updatedAt")
      VALUES ('legacy', 'w1', 'a1', 'Promo LINK', 'post1', ARRAY['LINK','PROMO'], false, true, 'Aqui: {link}',
        true, 'Toque abaixo', 'Quero', true, 'Me siga', true, 'Valeu!', 5,
        true, ARRAY['Te mandei DM!'], false, '2026-01-01', now()),
      ('plain', 'w1', 'a1', 'Sem DM', NULL, ARRAY['OI'], false, false, 'Oi!', false, NULL, NULL, false, NULL, false, NULL, 0, false, ARRAY[]::text[], true, '2026-02-01', now())`);
    await sql.query(`INSERT INTO "TrackedLink" (id, "workspaceId", "automationId", slug, label, "destinationUrl", position, "updatedAt") VALUES
      ('l1', 'w1', 'legacy', 'oldslug001', 'Site', 'https://loja.test', 0, now()),
      ('l2', 'w1', 'legacy', 'oldslug002', 'Zap', 'https://wa.me/55', 1, now())`);

    await sql.query(readFileSync(path.join(root, MIGRATION, "migration.sql"), "utf8"));
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  it("makes every existing automation a Comments automation and turns the old DM flag off", async () => {
    const { rows } = await sql.query(`SELECT id, type, "dmTriggerEnabled" FROM "Automation" WHERE id IN ('legacy','plain') ORDER BY id`);
    expect(rows).toEqual([
      { id: "legacy", type: "COMMENTS", dmTriggerEnabled: false },
      { id: "plain", type: "COMMENTS", dmTriggerEnabled: false },
    ]);
  });

  it("creates one Direct and one Stories copy with the same keywords and messages", async () => {
    const { rows } = await sql.query(`SELECT * FROM "Automation" WHERE id NOT IN ('legacy','plain') ORDER BY type`);
    expect(rows.map((r) => String(r.type)).sort()).toEqual(["DIRECT", "STORIES"]);
    for (const copy of rows) {
      expect(copy.name).toBe(copy.type === "DIRECT" ? "Promo LINK (Direct)" : "Promo LINK (Stories)");
      expect(copy.keywords).toEqual(["LINK", "PROMO"]);
      expect(copy.wholeWordMatch).toBe(false);
      expect(copy.matchAnyWord).toBe(false);
      expect(copy.dmMessage).toBe("Aqui: {link}");
      expect(copy.requireFollow).toBe(true);
      expect(copy.followPromptMessage).toBe("Me siga");
      expect([copy.followUpEnabled, copy.followUpMessage, copy.followUpDelayMinutes]).toEqual([true, "Valeu!", 5]);
      // Comment-only features are not copied.
      expect([copy.postId, copy.openingDmEnabled, copy.publicReplyEnabled]).toEqual([null, false, false]);
      expect([copy.triggerStoryReplies, copy.triggerStoryMentions, copy.replyCooldownHours]).toEqual([true, false, 24]);
      expect(copy.dmTriggerEnabled).toBe(false);
      expect(copy.createdAt.toISOString()).toBe(new Date("2026-01-01").toISOString());
    }
  });

  it("copies tracked links with new unique slugs and keeps the old ones", async () => {
    const { rows } = await sql.query(`SELECT a.type, l.slug, l.label, l."destinationUrl", l.position FROM "TrackedLink" l JOIN "Automation" a ON a.id = l."automationId" ORDER BY a.type, l.position`);
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r.slug)).size).toBe(6);
    expect(rows.filter((r) => r.type === "COMMENTS").map((r) => r.slug)).toEqual(["oldslug001", "oldslug002"]);
    for (const type of ["DIRECT", "STORIES"]) {
      expect(rows.filter((r) => r.type === type).map((r) => [r.label, r.destinationUrl, r.position])).toEqual([
        ["Site", "https://loja.test", 0],
        ["Zap", "https://wa.me/55", 1],
      ]);
    }
  });

  it("does nothing more when run against already-migrated data", async () => {
    // The flag is now false everywhere, so the copy step selects nothing.
    const before = await sql.query(`SELECT count(*)::int AS n FROM "Automation"`);
    const dataPart = readFileSync(path.join(root, MIGRATION, "migration.sql"), "utf8").split("-- Data:")[1];
    await sql.query("-- Data:" + dataPart);
    const after = await sql.query(`SELECT count(*)::int AS n FROM "Automation"`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

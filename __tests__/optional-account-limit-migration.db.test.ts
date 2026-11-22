/** The migration that made the Instagram account limit optional. */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `optlimit_${randomBytes(4).toString("hex")}`;
const MIGRATION = "20261125120000_optional_account_limit";
const root = path.join(__dirname, "..", "prisma", "migrations");
let sql: Client;

describe.skipIf(!databaseUrl)("optional account limit migration", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const dirs = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name < MIGRATION)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    // Before: limits set by the previous migration and by the admin.
    await sql.query(`INSERT INTO "User" (id, email, "updatedAt") VALUES ('u1', 'o@x.test', now())`);
    await sql.query(`INSERT INTO "Workspace" (id, name, "ownerId", "instagramAccountLimit", "updatedAt") VALUES
      ('w1', 'Um', 'u1', 1, now()), ('w3', 'Três', 'u1', 3, now())`);
    await sql.query(readFileSync(path.join(root, MIGRATION, "migration.sql"), "utf8"));
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  it("makes every existing workspace follow the default (null)", async () => {
    const { rows } = await sql.query(`SELECT id, "instagramAccountLimit" AS lim FROM "Workspace" ORDER BY id`);
    expect(rows).toEqual([{ id: "w1", lim: null }, { id: "w3", lim: null }]);
  });

  it("starts the platform default as 'no limit' and keeps the price", async () => {
    const { rows } = await sql.query(`SELECT "pricePerAccountCents", "defaultInstagramAccountLimit" FROM "PlatformSettings"`);
    expect(rows).toEqual([{ pricePerAccountCents: 19900, defaultInstagramAccountLimit: null }]);
  });

  it("new workspaces follow the default too, and a number can still be stored", async () => {
    await sql.query(`INSERT INTO "Workspace" (id, name, "ownerId", "updatedAt") VALUES ('w_new', 'Novo', 'u1', now())`);
    await sql.query(`UPDATE "Workspace" SET "instagramAccountLimit" = 2 WHERE id = 'w3'`);
    const { rows } = await sql.query(`SELECT id, "instagramAccountLimit" AS lim FROM "Workspace" WHERE id IN ('w_new', 'w3') ORDER BY id`);
    expect(rows).toEqual([{ id: "w3", lim: 2 }, { id: "w_new", lim: null }]);
  });
});

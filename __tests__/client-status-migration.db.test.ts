/**
 * The migration that added client status, public sign-up and the admin area,
 * against a real Postgres: seeds the old shape, applies it, checks the result.
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `clientstatus_${randomBytes(4).toString("hex")}`;
const MIGRATION = "20261124120000_client_status_signup_admin";
const root = path.join(__dirname, "..", "prisma", "migrations");
let sql: Client;

describe.skipIf(!databaseUrl)("client status migration", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const dirs = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name < MIGRATION)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));

    await sql.query(`INSERT INTO "User" (id, email, "emailVerified", "createdAt", "updatedAt") VALUES
      ('u_script', 'script@x.test', NULL, '2026-05-01', now()),
      ('u_link', 'link@x.test', '2026-06-02', '2026-06-01', now())`);
    await sql.query(`INSERT INTO "Workspace" (id, name, "ownerId", "createdAt", "updatedAt") VALUES
      ('w_none', 'Sem contas', 'u_script', '2026-05-01', now()),
      ('w_one', 'Uma conta', 'u_link', '2026-06-01', now()),
      ('w_three', 'Três contas', 'u_link', '2026-07-01', now())`);
    await sql.query(`INSERT INTO "InstagramAccount" (id, "workspaceId", "instagramId", username, "accessToken", "updatedAt") VALUES
      ('a1', 'w_one', 'ig1', 'um', 'x', now()),
      ('a2', 'w_three', 'ig2', 'dois', 'x', now()),
      ('a3', 'w_three', 'ig3', 'tres', 'x', now()),
      ('a4', 'w_three', 'ig4', 'quatro', 'x', now())`);

    await sql.query(readFileSync(path.join(root, MIGRATION, "migration.sql"), "utf8"));
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  it("makes every existing workspace ACTIVE, legacy, with a limit equal to its accounts (at least 1)", async () => {
    const { rows } = await sql.query(`SELECT id, status::text, "instagramAccountLimit" AS lim, "signupSource"::text AS src, "statusChangedAt", "createdAt" FROM "Workspace" ORDER BY id`);
    expect(rows.map((r) => [r.id, r.status, r.lim, r.src])).toEqual([
      ["w_none", "ACTIVE", 1, "LEGACY"],
      ["w_one", "ACTIVE", 1, "LEGACY"],
      ["w_three", "ACTIVE", 3, "LEGACY"],
    ]);
    for (const r of rows) expect(r.statusChangedAt.toISOString()).toBe(r.createdAt.toISOString());
  });

  it("marks existing users as confirmed so they keep signing in", async () => {
    const { rows } = await sql.query(`SELECT id, "emailVerified" FROM "User" ORDER BY id`);
    expect(rows.find((r) => r.id === "u_script").emailVerified.toISOString()).toBe(new Date("2026-05-01").toISOString());
    expect(rows.find((r) => r.id === "u_link").emailVerified.toISOString()).toBe(new Date("2026-06-02").toISOString());
  });

  it("stores the default price per account (R$ 199,00)", async () => {
    const { rows } = await sql.query(`SELECT id, "pricePerAccountCents", currency FROM "PlatformSettings"`);
    expect(rows).toEqual([{ id: "default", pricePerAccountCents: 19900, currency: "BRL" }]);
  });

  it("new workspaces default to ACTIVE with limit 1 (operator script keeps working)", async () => {
    await sql.query(`INSERT INTO "Workspace" (id, name, "ownerId", "updatedAt") VALUES ('w_new', 'Novo', 'u_script', now())`);
    const { rows } = await sql.query(`SELECT status::text, "instagramAccountLimit" AS lim FROM "Workspace" WHERE id = 'w_new'`);
    expect(rows[0]).toEqual({ status: "ACTIVE", lim: 1 });
  });
});

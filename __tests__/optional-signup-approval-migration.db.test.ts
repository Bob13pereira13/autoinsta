/** The migration that made sign-up approval optional changes nobody's status. */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `optappr_${randomBytes(4).toString("hex")}`;
const MIGRATION = "20261127120000_optional_signup_approval";
const root = path.join(__dirname, "..", "prisma", "migrations");
let sql: Client;
let before: { id: string; status: string; statusChangedAt: Date | null; approvedAt: Date | null }[];

describe.skipIf(!databaseUrl)("optional sign-up approval migration", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const dirs = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name < MIGRATION)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    // Before: a confirmed sign-up awaiting approval, an unconfirmed one, and clients in every other status.
    await sql.query(`INSERT INTO "User" (id, email, "emailVerified", "updatedAt") VALUES
      ('u_conf', 'confirmado@loja.test', now(), now()), ('u_unconf', 'pendente@loja.test', NULL, now()), ('u_other', 'o@x.test', now(), now())`);
    await sql.query(`INSERT INTO "Workspace" (id, name, "ownerId", status, "signupSource", "statusChangedAt", "updatedAt") VALUES
      ('w_conf', 'Confirmado', 'u_conf', 'PENDING_APPROVAL', 'SELF_SIGNUP', '2026-11-20T10:00:00Z', now()),
      ('w_unconf', 'Sem confirmar', 'u_unconf', 'PENDING_APPROVAL', 'SELF_SIGNUP', '2026-11-21T10:00:00Z', now()),
      ('w_active', 'Ativo', 'u_other', 'ACTIVE', 'LEGACY', '2026-10-01T10:00:00Z', now()),
      ('w_disabled', 'Desativado', 'u_other', 'DISABLED', 'ADMIN', '2026-11-01T10:00:00Z', now()),
      ('w_rejected', 'Recusado', 'u_other', 'REJECTED', 'SELF_SIGNUP', '2026-11-02T10:00:00Z', now())`);
    before = (await sql.query(`SELECT id, status, "statusChangedAt", "approvedAt" FROM "Workspace" ORDER BY id`)).rows;
    await sql.query(readFileSync(path.join(root, MIGRATION, "migration.sql"), "utf8"));
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  it("keeps every workspace's status (and its dates) exactly as it was", async () => {
    const after = (await sql.query(`SELECT id, status, "statusChangedAt", "approvedAt" FROM "Workspace" ORDER BY id`)).rows;
    expect(after).toEqual(before);
    expect(after.filter((w) => w.status === "PENDING_APPROVAL").map((w) => w.id)).toEqual(["w_conf", "w_unconf"]);
  });

  it("no existing sign-up skips approval, not even an unconfirmed one", async () => {
    const { rows } = await sql.query(`SELECT DISTINCT "signupAutoActivate" AS auto FROM "Workspace"`);
    expect(rows).toEqual([{ auto: false }]);
  });

  it("approval starts off for new sign-ups, keeping the other settings", async () => {
    const { rows } = await sql.query(`SELECT "requireSignupApproval", "pricePerAccountCents" FROM "PlatformSettings"`);
    expect(rows).toEqual([{ requireSignupApproval: false, pricePerAccountCents: 19900 }]);
  });
});

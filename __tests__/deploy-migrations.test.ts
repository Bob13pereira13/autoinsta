/**
 * Deploy = redeploy web and worker. Each applies pending migrations when it
 * starts (`prisma migrate deploy`, under Prisma's database lock, so starting
 * together applies each one once), then becomes the app with `exec`, so a
 * container stop reaches it (the worker finishes its job). The old version
 * keeps running next to the migrated database for a few seconds, hence the
 * rules in AGENTS.md: add first, remove only in a later deploy.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.join(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;

const migrationsDir = path.join(root, "prisma/migrations");
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => ({ name: d.name, sql: readFileSync(path.join(migrationsDir, d.name, "migration.sql"), "utf8") }));

/** SQL without comments, one statement per item. */
function statements(sql: string): string[] {
  return sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Migrations that remove or change what earlier code used, each reviewed: the
 * code had stopped using it in an earlier deploy. A new one goes here only
 * after the same check (AGENTS.md, "Migrações").
 */
const REVIEWED_DESTRUCTIVE = [
  "20260525120000_remove_billing",
  "20261122120000_automation_channels_media",
  "20261126120000_drop_follower_snapshots",
  "20261128120000_drop_service_keys",
];
const DESTRUCTIVE = /\b(DROP (COLUMN|TABLE|TYPE|VALUE)|RENAME (COLUMN|TO)|SET NOT NULL|SET DATA TYPE|ALTER COLUMN \S+ TYPE)\b/i;

describe("deploy: migrations on start", () => {
  it("web and worker apply pending migrations first, then become the app (exec)", () => {
    expect(scripts.start).toBe("prisma migrate deploy && exec next start");
    expect(scripts.worker).toBe("prisma migrate deploy && exec tsx worker/dm-worker.ts");
  });

  it("the image starts the web with npm run start, and the cron does not migrate", () => {
    const dockerfile = read("Dockerfile");
    expect(dockerfile).toMatch(/^CMD \["npm", "run", "start"\]$/m);
    expect(read("scripts/cron.sh")).not.toMatch(/prisma|migrate/i);
  });

  it("the image carries the migration engine for its own OpenSSL (no download on start)", () => {
    // node:20-slim has no OpenSSL; without it at `npm ci`, Prisma fetches the
    // engine for OpenSSL 1.1 and every start would download the right one.
    const build = read("Dockerfile").split(/^FROM .* AS runner$/m)[0];
    const openssl = build.search(/apt-get install[^\n]*\bopenssl\b/);
    expect(openssl).toBeGreaterThan(-1);
    expect(openssl).toBeLessThan(build.indexOf("RUN npm ci"));
  });

  it("new columns on existing tables are NOT NULL only with a default", () => {
    const bad = migrations.flatMap((m) =>
      statements(m.sql)
        .filter((s) => /^ALTER TABLE/i.test(s))
        .flatMap((s) => s.split(/,(?=\s*ADD COLUMN)/i))
        .filter((s) => /ADD COLUMN/i.test(s) && /NOT NULL/i.test(s) && !/DEFAULT/i.test(s))
        .map((s) => `${m.name}: ${s}`),
    );
    expect(bad).toEqual([]);
  });

  it("removing or changing a column, table or type only in reviewed migrations", () => {
    const destructive = migrations.filter((m) => statements(m.sql).some((s) => DESTRUCTIVE.test(s))).map((m) => m.name);
    expect(destructive).toEqual(REVIEWED_DESTRUCTIVE);
  });
});

/**
 * Diagnostics in the admin area, on a real Postgres: only ADMIN_EMAILS get
 * it; the admin sees every client's events, each tagged with its client, and
 * can filter by one client. Also checks the migration that dropped the
 * service keys of the removed API/MCP.
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const m = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
  session: null as null | { user: { id: string; email: string } },
  alerts: [] as Array<{ level: "warning" | "error"; message: string; instagramAccountId?: string; createdAt: string }>,
}));
vi.mock("@/lib/db/client", () => ({ get prisma() { return m.db; } }));
vi.mock("@/lib/auth", () => ({ auth: async () => m.session }));
vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({ getJobCounts: async () => ({ waiting: 1, active: 0, delayed: 2, failed: 3 }) }),
}));
vi.mock("@/lib/ops/worker-health", () => ({
  getWorkerHealth: async () => ({ healthy: true, ageMs: 4000, heartbeat: null }),
  getWorkerAlerts: async () => m.alerts,
}));

import { GET } from "../app/api/admin/diagnostics/route";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `diag_${randomBytes(4).toString("hex")}`;
const ADMIN = "dono@plataforma.test";
let sql: Client;

const get = (query = "") => GET(new NextRequest(`https://app.test/api/admin/diagnostics${query}`));

describe.skipIf(!databaseUrl)("admin Diagnostics", () => {
  beforeAll(async () => {
    vi.stubEnv("ADMIN_EMAILS", ADMIN);
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    }
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
    m.db = db;

    await db.user.create({ data: { id: "u", email: "dona@loja.test" } });
    for (const [id, company] of [["wa", "Loja A"], ["wb", "Loja B"]] as const) {
      await db.workspace.create({ data: { id, name: id, companyName: company, ownerId: "u" } });
      await db.instagramAccount.create({ data: { id: `acc_${id}`, workspaceId: id, instagramId: `ig_${id}`, username: id, accessToken: "x" } });
      await db.automation.create({ data: { id: `auto_${id}`, workspaceId: id, instagramAccountId: `acc_${id}`, name: `Link ${company}`, keywords: ["LINK"], dmMessage: "Oi" } });
      await db.webhookEvent.create({ data: { workspaceId: id, object: "instagram", payload: {}, status: "FAILED", errorMessage: `webhook ${id}` } });
      await db.dmLog.create({
        data: { workspaceId: id, automationId: `auto_${id}`, instagramAccountId: `acc_${id}`, commenterId: "p", commentText: `LINK ${id}`, commentId: `c_${id}`, status: "FAILED", errorMessage: `dm ${id}` },
      });
      await db.operationalEvent.create({ data: { workspaceId: id, source: "TOKEN_REFRESH", level: "ERROR", message: `token ${id}` } });
    }
    await db.operationalEvent.create({ data: { source: "SYSTEM", level: "WARNING", message: "platform-wide" } });
    m.alerts = [
      { level: "error", message: "alert wa", instagramAccountId: "ig_wa", createdAt: new Date().toISOString() },
      { level: "error", message: "alert wb", instagramAccountId: "acc_wb", createdAt: new Date().toISOString() },
    ];
  }, 60_000);

  afterAll(async () => {
    await m.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    m.session = { user: { id: "admin", email: ADMIN } };
  });

  it("the migrations dropped the service keys table", async () => {
    const { rows } = await sql.query(`SELECT to_regclass('"${schema}"."ServiceKey"') AS t`);
    expect(rows[0].t).toBeNull();
  });

  it("answers 403 to a client and to nobody signed in", async () => {
    m.session = { user: { id: "u", email: "dona@loja.test" } };
    const res = await get();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ success: false, error: "Forbidden" });
    m.session = null;
    expect((await get()).status).toBe(403);
  });

  it("shows the admin every client's events, each tagged with its client", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.filter).toBeNull();
    expect(data.clients.map((c: { name: string }) => c.name)).toEqual(["Loja A", "Loja B"]);
    expect(data.queueCounts).toEqual({ waiting: 1, active: 0, delayed: 2, failed: 3 });
    const clientsOf = (rows: Array<{ client: { name: string } | null }>) => rows.map((r) => r.client?.name ?? null).sort();
    expect(clientsOf(data.webhookFailures)).toEqual(["Loja A", "Loja B"]);
    expect(clientsOf(data.dmFailures)).toEqual(["Loja A", "Loja B"]);
    expect(clientsOf(data.tokenRefreshFailures)).toEqual(["Loja A", "Loja B"]);
    expect(clientsOf(data.workerAlerts)).toEqual(["Loja A", "Loja B"]);
    // Platform-wide events (no client) show without the filter.
    expect(data.operationalEvents.map((e: { message: string }) => e.message)).toEqual(expect.arrayContaining(["platform-wide", "token wa", "token wb"]));
  });

  it("filters by one client", async () => {
    const { data } = await (await get("?workspaceId=wb")).json();
    expect(data.filter).toBe("wb");
    expect(data.webhookFailures.map((e: { errorMessage: string }) => e.errorMessage)).toEqual(["webhook wb"]);
    expect(data.dmFailures.map((e: { errorMessage: string }) => e.errorMessage)).toEqual(["dm wb"]);
    expect(data.tokenRefreshFailures.map((e: { message: string }) => e.message)).toEqual(["token wb"]);
    expect(data.workerAlerts.map((a: { message: string }) => a.message)).toEqual(["alert wb"]);
    expect(data.operationalEvents.map((e: { message: string }) => e.message)).toEqual(["token wb"]);
    // The filter list still offers every client.
    expect(data.clients).toHaveLength(2);
  });
});

/**
 * After the Overview removal, on a real Postgres built from every migration:
 * the FollowerSnapshot table is gone, and the Dashboard numbers, the
 * automation list analytics and the shared campaign report still work.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
 *     npx vitest run __tests__/overview-removed.db.test.ts
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({ db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient }));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/auth", () => ({ getCurrentWorkspaceId: async () => "w1", getCurrentUserId: async () => "u1" }));

import { GET as dashboardStats } from "../app/api/dashboard/stats/route";
import { GET as listAutomations } from "../app/api/automations/route";
import { getCampaignReportBySlug } from "../lib/reports/data";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `overview_${randomBytes(4).toString("hex")}`;
const migrationsRoot = path.join(__dirname, "..", "prisma", "migrations");
let sql: Client;

describe.skipIf(!databaseUrl)("Dashboard and reports without the Overview", () => {
  beforeAll(async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://app.test");
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const dirs = readdirSync(migrationsRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) {
      await sql.query(readFileSync(path.join(migrationsRoot, dir.name, "migration.sql"), "utf8"));
    }
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
    state.db = db;

    await db.user.create({ data: { id: "u1", email: "dono@loja.test" } });
    await db.workspace.create({ data: { id: "w1", name: "Loja", ownerId: "u1" } });
    await db.instagramAccount.create({ data: { id: "acc1", workspaceId: "w1", instagramId: "ig1", username: "loja", accessToken: "enc" } });
    await db.automation.create({
      data: {
        id: "auto1", workspaceId: "w1", instagramAccountId: "acc1", name: "LINK", keywords: ["LINK"], dmMessage: "Aqui",
        isActive: true, reportShareSlug: "relatorio1", reportShareEnabled: true,
      },
    });
    const now = new Date();
    const logs = [
      { status: "SENT" as const, n: 3 },
      { status: "SKIPPED_DEDUP" as const, n: 1 },
      { status: "FAILED" as const, n: 1 },
    ];
    let i = 0;
    for (const { status, n } of logs) {
      for (let k = 0; k < n; k++, i++) {
        await db.dmLog.create({
          data: {
            workspaceId: "w1", automationId: "auto1", instagramAccountId: "acc1", commenterId: `fan${i}`, commenterName: `fan${i}`,
            commentText: "LINK", commentId: `c${i}`, matchedKeyword: "LINK", status, dmSentAt: status === "SENT" ? now : null,
          },
        });
      }
    }
    const link = await db.trackedLink.create({ data: { workspaceId: "w1", automationId: "auto1", slug: "s1", destinationUrl: "https://loja.test" } });
    for (const visitor of ["a", "b"]) {
      await db.linkClick.create({ data: { workspaceId: "w1", automationId: "auto1", instagramAccountId: "acc1", trackedLinkId: link.id, recipientHash: visitor } });
    }
  }, 60_000);

  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
    vi.unstubAllEnvs();
  });

  it("the migration dropped FollowerSnapshot and can run again safely", async () => {
    const exists = async () => (await sql.query(`SELECT to_regclass('"${schema}"."FollowerSnapshot"') AS t`)).rows[0].t;
    expect(await exists()).toBeNull();
    const drop = readFileSync(path.join(migrationsRoot, "20261126120000_drop_follower_snapshots", "migration.sql"), "utf8");
    await sql.query(drop);
    expect(await exists()).toBeNull();
  });

  it("the Dashboard numbers come out as before", async () => {
    const res = await dashboardStats(new NextRequest("https://app.test/api/dashboard/stats"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ activeAutomations: 1, dmsSentMonth: 3, dmsSkippedMonth: 1, totalDMs: 3, clicksThisMonth: 2 });
    expect(data.ctrThisMonth).toBeCloseTo(66.7, 0);
  });

  it("the automation list still carries each automation's analytics", async () => {
    const res = await listAutomations(new NextRequest("https://app.test/api/automations"));
    expect(res.status).toBe(200);
    const [automation] = (await res.json()).data;
    expect(automation.analytics).toMatchObject({ sent: 3, clicks: 2 });
  });

  it("the shared campaign report still works", async () => {
    const report = await getCampaignReportBySlug("relatorio1", "pt-BR");
    expect(report?.metrics).toMatchObject({ sent: 3, failed: 1, clicks: 2 });
    expect(report?.trackedLinks).toEqual([{ slug: "s1", destinationHost: "loja.test", clicks: 2 }]);
  });
});

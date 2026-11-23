/**
 * Webhook receipts end to end, on a real Postgres, through POST /api/webhook:
 * every signed POST leaves a short receipt (accepted, or discarded and why);
 * an unsigned one leaves none; the admin's Diagnostics report reads them
 * (did messages arrive? which ids were discarded? proposed mapping); receipts
 * older than 24 hours are purged.
 */
import { createHmac, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
  jobs: [] as string[],
}));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/queue/client", async (original) => ({
  ...(await original<typeof import("@/lib/queue/client")>()),
  getDMQueue: () => ({ add: async (name: string) => void state.jobs.push(name), getJob: async () => undefined, getJobCounts: async () => ({}) }),
}));
vi.mock("@/lib/ops/worker-health", () => ({ getWorkerHealth: async () => ({ healthy: true }), getWorkerAlerts: async () => [] }));

import { POST } from "../app/api/webhook/route";
import { getDiagnostics } from "../lib/admin/diagnostics";
import { purgeExpiredData } from "../lib/privacy/purge";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `receipts_${randomBytes(4).toString("hex")}`;
const SECRET = "receipts-app-secret";
const IG = "17841400000000001";
let sql: Client;

function post(body: unknown, { sign = true, raw }: { sign?: boolean; raw?: string } = {}) {
  const text = raw ?? JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sign) headers["x-hub-signature-256"] = "sha256=" + createHmac("sha256", SECRET).update(text).digest("hex");
  return POST(new NextRequest("https://app.test/api/webhook", { method: "POST", body: text, headers }));
}
const receipts = () => state.db.webhookReceipt.findMany({ orderBy: { createdAt: "asc" } });

describe.skipIf(!databaseUrl)("webhook receipts", () => {
  beforeAll(async () => {
    // Instagram's login: webhooks signed with the Instagram app secret.
    vi.stubEnv("INSTAGRAM_APP_SECRET", SECRET);
    vi.stubEnv("FACEBOOK_APP_SECRET", "");
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    }
    state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
    await state.db.user.create({ data: { id: "u1", email: "dono@primus.test" } });
    await state.db.workspace.create({ data: { id: "w1", name: "Primus", ownerId: "u1" } });
    await state.db.instagramAccount.create({
      data: { workspaceId: "w1", instagramId: IG, username: "primus3d_", accessToken: "enc", metaLogin: "INSTAGRAM", instagramScopedId: "IGSCOPED1" },
    });
  }, 60_000);

  beforeEach(async () => {
    await state.db.webhookReceipt.deleteMany();
    await state.db.webhookEvent.deleteMany();
    state.jobs = [];
  });

  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
    vi.unstubAllEnvs();
  });

  it("a comment for the connected account: accepted, processed, and the receipt says so", async () => {
    const res = await post({ object: "instagram", entry: [{ id: IG, time: 1, changes: [{ field: "comments", value: { id: "c1", text: "LINK", from: { id: "998877", username: "fulano" }, media: { id: "m1" } } }] }] });
    expect(res.status).toBe(200);
    const [receipt] = await receipts();
    expect(receipt).toMatchObject({ object: "instagram", accepted: true, reason: null });
    expect(receipt.entries).toEqual([{ id: IG, keys: ["changes", "id", "time"], fields: ["comments"], messaging: {}, standby: {}, otherBusinessIds: [], accepted: true, reason: null }]);
    expect(JSON.stringify(receipt)).not.toMatch(/LINK|fulano|998877/);
    expect(await state.db.webhookEvent.count()).toBe(1);
    expect(state.jobs).toEqual(["process-comment"]);
  });

  it("a message under an id no account has: 200 to Meta, nothing processed, the receipt keeps the evidence", async () => {
    const res = await post({ object: "instagram", entry: [{ id: "555", time: 1, messaging: [{ sender: { id: "998877" }, recipient: { id: IG }, timestamp: 1, message: { mid: "m1", text: "PREÇO" } }] }] });
    expect(res.status).toBe(200);
    expect(await state.db.webhookEvent.count()).toBe(0);
    const [receipt] = await receipts();
    expect(receipt).toMatchObject({ accepted: false, reason: null });
    expect(receipt.entries).toEqual([
      expect.objectContaining({ id: "555", messaging: { message: 1 }, otherBusinessIds: [IG], accepted: false, reason: "unknown_account" }),
    ]);
    expect(JSON.stringify(receipt)).not.toMatch(/PREÇO|998877/);

    // The admin's report: messages arrived and were discarded; proposed mapping, nothing changed.
    const report = (await getDiagnostics()).webhookReceipts;
    expect(report.messages).toBe("discarded_only");
    expect(report.unknown).toEqual([
      expect.objectContaining({ id: "555", count: 1, proposal: { username: "primus3d_", instagramId: IG, client: "Primus", why: "business_id_inside" } }),
    ]);
    expect((await state.db.instagramAccount.findFirstOrThrow()).instagramId).toBe(IG);
  });

  it("another object, an invalid body and an unsigned POST", async () => {
    await post({ object: "page", entry: [{ id: "PAGE1", time: 1, messaging: [] }] });
    await post(undefined, { raw: "{not json" });
    const unsigned = await post({ object: "instagram", entry: [{ id: IG, time: 1, messaging: [] }] }, { sign: false });
    expect(unsigned.status).toBe(401);
    const rows = await receipts();
    expect(rows.map((r) => [r.object, r.accepted, r.reason])).toEqual([
      ["page", false, "object_not_instagram"],
      [null, false, "invalid_json"],
    ]);
  });

  it("receipts older than 24 hours are purged", async () => {
    await state.db.webhookReceipt.create({ data: { object: "instagram", accepted: true, entries: [], createdAt: new Date(Date.now() - 25 * 3600_000) } });
    await state.db.webhookReceipt.create({ data: { object: "instagram", accepted: true, entries: [] } });
    const result = await purgeExpiredData();
    expect(result.webhookReceiptsDeleted).toBe(1);
    expect(await state.db.webhookReceipt.count()).toBe(1);
  });
});

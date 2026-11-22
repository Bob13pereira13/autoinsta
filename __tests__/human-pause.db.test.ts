/**
 * Human pause, end to end on a real Postgres and Redis: the webhook, the
 * queue jobs, the worker and the guards (not mocked). A message someone from
 * the account sends in the Instagram app arrives as an echo whose mid is not
 * the bot's; from then on a no-keyword Direct automation stays quiet with
 * that person for 24 hours. The bot's own echoes never pause anything.
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import Redis from "ioredis";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const m = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
  redis: undefined as unknown as import("ioredis").default,
  queued: [] as Array<{ name: string; data: Record<string, unknown> }>,
  sendDirectMessage: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ get prisma() { return m.db; } }));
vi.mock("@/lib/meta/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/meta/client")>()),
  sendDirectMessage: m.sendDirectMessage,
  getUserUsername: vi.fn(async () => "pessoa"),
}));
vi.mock("@/lib/meta/oauth", () => ({ decryptToken: () => "token" }));
vi.mock("@/lib/utils/rate-limiter", () => ({
  reserveDMSlot: vi.fn(async () => ({ allowed: true, reserved: true })),
  releaseDMSlot: vi.fn(),
  reserveSendSlots: vi.fn(async () => true),
  countSendCalls: vi.fn(),
}));
vi.mock("@/lib/billing/usage", () => ({
  reserveWorkspaceDMSend: vi.fn(async () => ({ allowed: true, periodStart: new Date(), limit: 1000 })),
  releaseWorkspaceDMReservation: vi.fn(),
}));
vi.mock("@/lib/ops/worker-health", () => ({ recordWorkerAlert: vi.fn() }));
vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({ add: async (name: string, data: Record<string, unknown>) => { m.queued.push({ name, data }); } }),
  // The guards' cooldown lives in Redis: a real one.
  getRedisConnection: () => m.redis,
  POSTBACK_JOB_NAME: "process-postback",
  FOLLOWUP_JOB_NAME: "process-followup",
  MESSAGE_JOB_NAME: "process-message",
  ECHO_JOB_NAME: "process-echo",
}));
vi.mock("bullmq", () => ({
  Worker: function (_n: string, processor: unknown) {
    (global as Record<string, unknown>).__pauseProcessor = processor;
    return { on: vi.fn(), close: vi.fn() };
  },
  UnrecoverableError: class UnrecoverableError extends Error {},
}));

import { createDMWorker } from "../lib/queue/dm-worker";
import { processInstagramWebhook } from "../lib/queue/process-webhook";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `pause_${randomBytes(4).toString("hex")}`;
const run = randomBytes(3).toString("hex");
let sql: Client;
type Job = { name: string; data: Record<string, unknown>; id: string; attemptsMade: number };
let processor: (job: Job) => Promise<void>;
let botMid = 0;

/** Webhook → queued jobs → worker, as in production (the queue delay is skipped). */
async function deliver(payload: unknown) {
  m.queued.length = 0;
  await processInstagramWebhook({ payload, provider: "META", workspaceId: undefined } as Parameters<typeof processInstagramWebhook>[0]);
  for (const job of [...m.queued]) await processor({ ...job, id: `job_${Math.random()}`, attemptsMade: 0 });
}
const incoming = (person: string, text: string) => ({
  object: "instagram",
  entry: [{ id: "ig_acc", time: Date.now(), messaging: [{ sender: { id: person }, recipient: { id: "ig_acc" }, timestamp: Date.now(), message: { mid: `in_${person}_${Math.random()}`, text } }] }],
});
// What Meta sends when the account itself sends a message (app, Business Suite or the API).
const echo = (person: string, mid: string) => ({
  object: "instagram",
  entry: [{ id: "ig_acc", time: Date.now(), messaging: [{ sender: { id: "ig_acc" }, recipient: { id: person }, timestamp: Date.now(), message: { mid, text: "Oi! Aqui é a Ana da loja.", is_echo: true } }] }],
});

describe.skipIf(!databaseUrl)("human pause from the Instagram app", () => {
  beforeAll(async () => {
    m.redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    }
    m.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
    await m.db.user.create({ data: { id: "u1", email: "dona@loja.test", emailVerified: new Date() } });
    await m.db.workspace.create({ data: { id: "w1", name: "Loja", ownerId: "u1", members: { create: { userId: "u1", role: "OWNER" } } } });
    await m.db.instagramAccount.create({ data: { id: "acc1", workspaceId: "w1", instagramId: "ig_acc", username: "loja", accessToken: "enc" } });
    // Direct, no keyword: answers any message, so it is the one the pause protects.
    await m.db.automation.create({ data: { id: "auto_any", workspaceId: "w1", instagramAccountId: "acc1", name: "Boas-vindas", type: "DIRECT", matchAnyWord: true, keywords: [], dmMessage: "Oi! Já te respondo." } });
    createDMWorker();
    processor = (global as Record<string, unknown>).__pauseProcessor as (job: Job) => Promise<void>;
  }, 60_000);

  afterAll(async () => {
    await m.db?.$disconnect();
    m.redis?.disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  beforeEach(() => {
    m.sendDirectMessage.mockReset();
    m.sendDirectMessage.mockImplementation(async () => ({ recipient_id: "x", message_id: `bot_mid_${run}_${++botMid}` }));
  });

  it("a message sent in the Instagram app pauses the no-keyword automation with that person", async () => {
    const person = `p_human_${run}`;
    await deliver(echo(person, `phone_mid_${run}`));
    const activity = await m.db.conversationActivity.findUnique({ where: { instagramAccountId_recipientId: { instagramAccountId: "acc1", recipientId: person } } });
    expect(activity).not.toBeNull();

    await deliver(incoming(person, "oi, tudo bem?"));
    expect(m.sendDirectMessage).not.toHaveBeenCalled();
    const log = await m.db.dmLog.findFirst({ where: { commenterId: person } });
    expect(log?.status).toBe("SKIPPED_HUMAN_ACTIVE");
  });

  it("someone nobody from the account talked to is answered", async () => {
    const person = `p_new_${run}`;
    await deliver(incoming(person, "olá"));
    expect(m.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect((await m.db.dmLog.findFirst({ where: { commenterId: person } }))?.status).toBe("SENT");
  });

  it("the echo of the bot's own reply does not pause anything", async () => {
    const person = `p_bot_${run}`;
    await deliver(incoming(person, "olá"));
    expect(m.sendDirectMessage).toHaveBeenCalledTimes(1);
    const sentMid = (await m.sendDirectMessage.mock.results[0].value).message_id as string;
    expect(await m.db.botMessage.count({ where: { mid: sentMid } })).toBe(1);

    await deliver(echo(person, sentMid));
    expect(await m.db.conversationActivity.count({ where: { recipientId: person } })).toBe(0);
  });
});

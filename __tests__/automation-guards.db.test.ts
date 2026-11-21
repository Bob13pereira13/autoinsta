/**
 * Cooldown and human pause for no-keyword Stories/Direct automations, against
 * a real Postgres and the local Redis.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
 *     npx vitest run __tests__/automation-guards.db.test.ts
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({ db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient }));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));

import {
  claimReplyCooldown,
  handleEcho,
  isHumanConversationActive,
  recordBotMessage,
  recordHumanMessage,
} from "../lib/automation/guards";
import { getRedisConnection } from "../lib/queue/client";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `guards_${randomBytes(4).toString("hex")}`;
const run = randomBytes(3).toString("hex");
let sql: Client;

describe.skipIf(!databaseUrl)("Stories/Direct guards", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    }
    state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
    await state.db.user.create({ data: { id: "u1", email: "o@x.test" } });
    await state.db.workspace.create({ data: { id: "w1", name: "W", ownerId: "u1" } });
    await state.db.instagramAccount.create({ data: { id: "acc1", workspaceId: "w1", instagramId: "ig1", username: "loja", accessToken: "enc" } });
    await state.db.automation.create({ data: { id: "auto1", workspaceId: "w1", instagramAccountId: "acc1", name: "Oi", type: "DIRECT", matchAnyWord: true, dmMessage: "Oi!" } });
  }, 60_000);

  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
    getRedisConnection().disconnect();
  });

  it("allows one reply per person per window, even for simultaneous messages", async () => {
    const person = `p_${run}_a`;
    const claims = await Promise.all(
      Array.from({ length: 5 }, () => claimReplyCooldown({ automationId: "auto1", recipientId: person, hours: 24 }))
    );
    expect(claims.filter((c) => c.allowed)).toHaveLength(1);
    // Another person is not affected.
    expect((await claimReplyCooldown({ automationId: "auto1", recipientId: `p_${run}_b`, hours: 24 })).allowed).toBe(true);
  });

  it("frees the window when the send failed", async () => {
    const person = `p_${run}_c`;
    const first = await claimReplyCooldown({ automationId: "auto1", recipientId: person, hours: 24 });
    expect(first.allowed).toBe(true);
    if (first.allowed) await first.release();
    expect((await claimReplyCooldown({ automationId: "auto1", recipientId: person, hours: 24 })).allowed).toBe(true);
  });

  it("still blocks from the database after Redis lost the key", async () => {
    const person = `p_${run}_d`;
    await state.db.dmLog.create({
      data: { workspaceId: "w1", automationId: "auto1", instagramAccountId: "acc1", commenterId: person, commentText: "oi", commentId: `dm:old_${run}`, status: "SENT", dmSentAt: new Date(Date.now() - 2 * 3600_000) },
    });
    expect((await claimReplyCooldown({ automationId: "auto1", recipientId: person, hours: 24 })).allowed).toBe(false);
    // A reply older than the window no longer blocks.
    expect((await claimReplyCooldown({ automationId: "auto1", recipientId: person, hours: 1 })).allowed).toBe(true);
  });

  it("pauses for 24h after a human message, then resumes", async () => {
    const now = new Date();
    expect(await isHumanConversationActive({ accountConnectionId: "acc1", recipientId: "h1", now })).toBe(false);
    await recordHumanMessage({ accountConnectionId: "acc1", recipientId: "h1", at: new Date(now.getTime() - 23 * 3600_000) });
    expect(await isHumanConversationActive({ accountConnectionId: "acc1", recipientId: "h1", now })).toBe(true);
    await recordHumanMessage({ accountConnectionId: "acc1", recipientId: "h1", at: new Date(now.getTime() - 25 * 3600_000) });
    expect(await isHumanConversationActive({ accountConnectionId: "acc1", recipientId: "h1", now })).toBe(false);
  });

  it("treats an echo of the bot's own message as the bot, any other as a human", async () => {
    await recordBotMessage({ messageId: `mid_bot_${run}`, instagramId: "ig1", recipientId: "h2" });
    expect(await handleEcho({ accountConnectionId: "acc1", recipientId: "h2", messageId: `mid_bot_${run}` })).toBe("bot");
    expect(await isHumanConversationActive({ accountConnectionId: "acc1", recipientId: "h2" })).toBe(false);

    expect(await handleEcho({ accountConnectionId: "acc1", recipientId: "h2", messageId: `mid_phone_${run}` })).toBe("human");
    expect(await isHumanConversationActive({ accountConnectionId: "acc1", recipientId: "h2" })).toBe(true);
  });

  it("never throws when recording a bot message fails", async () => {
    await expect(recordBotMessage({ messageId: `mid_dup_${run}`, instagramId: "ig1" })).resolves.toBeUndefined();
    await expect(recordBotMessage({ messageId: `mid_dup_${run}`, instagramId: "ig1" })).resolves.toBeUndefined();
    await expect(recordBotMessage({ messageId: undefined, instagramId: "ig1" })).resolves.toBeUndefined();
  });
});

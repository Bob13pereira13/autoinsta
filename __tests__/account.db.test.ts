/**
 * Password accounts against a real Postgres (and the local Redis for the
 * login throttle, which fails open without it).
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
 *     npx vitest run __tests__/account.db.test.ts
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({ db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient }));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));
const sent = vi.hoisted(() => [] as Array<{ to: string; subject: string; text: string }>);
vi.mock("@/lib/email/send", () => ({
  getEmailFrom: () => "Test <test@example.test>",
  sendEmail: async (email: { to: string; subject: string; text: string }) => {
    sent.push(email);
  },
}));

import { hashPassword } from "../lib/account/password";
import {
  AUTH_TOKEN_TTL_MS,
  createAuthToken,
  findValidAuthToken,
  requestPasswordReset,
  setPasswordWithToken,
} from "../lib/account/tokens";
import { canReceiveMagicLink, isSessionStillValid } from "../lib/account/access";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `account_${randomBytes(4).toString("hex")}`;
let sql: Client;

describe.skipIf(!databaseUrl)("password accounts on real PostgreSQL", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
  }, 60_000);

  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  beforeEach(async () => {
    sent.length = 0;
    await sql.query(`TRUNCATE "${schema}"."User", "${schema}"."Workspace", "${schema}"."WorkspaceInvitation" CASCADE`);
  });

  it("sets a password once through a welcome link", async () => {
    const user = await state.db.user.create({ data: { email: "cliente@loja.test" } });
    const token = await createAuthToken(user.id, "WELCOME");

    expect(await setPasswordWithToken(token, "curta")).toMatchObject({ ok: false });
    const result = await setPasswordWithToken(token, "senha-forte-2026");
    expect(result).toEqual({ ok: true, email: "cliente@loja.test" });

    const saved = await state.db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.passwordHash).toMatch(/^scrypt\$/);
    expect(saved.passwordChangedAt).toBeInstanceOf(Date);
    expect(saved.emailVerified).toBeInstanceOf(Date);

    // Single use.
    expect(await setPasswordWithToken(token, "outra-senha-2026")).toMatchObject({ ok: false });
    expect(await findValidAuthToken(token)).toBeNull();
  });

  it("stores only a hash of the token and invalidates older links", async () => {
    const user = await state.db.user.create({ data: { email: "a@loja.test" } });
    const first = await createAuthToken(user.id, "RESET");
    const second = await createAuthToken(user.id, "RESET");
    const rows = await state.db.authToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(second);
    expect(await findValidAuthToken(first)).toBeNull();
    expect(await findValidAuthToken(second)).not.toBeNull();
  });

  it("rejects expired links and links of disabled users", async () => {
    const user = await state.db.user.create({ data: { email: "b@loja.test" } });
    const token = await createAuthToken(user.id, "RESET");
    await state.db.authToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await findValidAuthToken(token)).toBeNull();

    const fresh = await createAuthToken(user.id, "RESET");
    await state.db.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
    expect(await findValidAuthToken(fresh)).toBeNull();
    expect(AUTH_TOKEN_TTL_MS.RESET).toBe(60 * 60 * 1000);
  });

  it("sends reset e-mails only to existing accounts, with a cooldown", async () => {
    await state.db.user.create({ data: { email: "c@loja.test" } });
    await requestPasswordReset("C@Loja.test ");
    await requestPasswordReset("c@loja.test");
    await requestPasswordReset("ninguem@loja.test");
    expect(sent.map((e) => e.to)).toEqual(["c@loja.test"]);
    expect(sent[0].text).toContain("/redefinir-senha?token=");
  });

  it("ends sessions opened before a password change or after disabling", async () => {
    const user = await state.db.user.create({
      data: { email: "d@loja.test", passwordChangedAt: new Date("2026-11-01T00:00:00Z") },
    });
    expect(await isSessionStillValid(user.id, new Date("2026-11-02").getTime())).not.toBeNull();
    expect(await isSessionStillValid(user.id, new Date("2026-10-31").getTime())).toBeNull();
    await state.db.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
    expect(await isSessionStillValid(user.id, Date.now())).toBeNull();
    expect(await isSessionStillValid("missing", Date.now())).toBeNull();
  });

  it("only sends magic links to existing active users or invited e-mails", async () => {
    const owner = await state.db.user.create({ data: { email: "dono@loja.test" } });
    await state.db.user.create({ data: { email: "bloqueado@loja.test", disabledAt: new Date() } });
    const ws = await state.db.workspace.create({ data: { name: "Loja", ownerId: owner.id } });
    await state.db.workspaceInvitation.create({
      data: { workspaceId: ws.id, email: "convidado@loja.test", token: "t1", expiresAt: new Date(Date.now() + 86_400_000) },
    });

    expect(await canReceiveMagicLink("Dono@Loja.test")).toBe(true);
    expect(await canReceiveMagicLink("convidado@loja.test")).toBe(true);
    expect(await canReceiveMagicLink("bloqueado@loja.test")).toBe(false);
    expect(await canReceiveMagicLink("estranho@spam.test")).toBe(false);
    expect(await canReceiveMagicLink(null)).toBe(false);
  });

  it("authorize() accepts the right password and throttles repeated failures", async () => {
    const { authorizeWithPassword: authorize, LoginRateLimitedError } = await import("../lib/account/authorize");
    const email = `login-${randomBytes(3).toString("hex")}@loja.test`;
    await state.db.user.create({ data: { email, passwordHash: await hashPassword("senha-certa-2026") } });
    const request = new Request("https://app.test/api/auth/callback/credentials", {
      // Unique per run: the throttle state lives in Redis across runs.
      headers: { "x-forwarded-for": `10.${randomBytes(3).join(".")}` },
    });

    expect(await authorize({ email: email.toUpperCase(), password: "senha-certa-2026" }, request)).toMatchObject({ email });
    for (let i = 0; i < 5; i++) {
      expect(await authorize({ email, password: "errada" }, request)).toBeNull();
    }
    await expect(authorize({ email, password: "senha-certa-2026" }, request)).rejects.toBeInstanceOf(
      LoginRateLimitedError
    );
    const unknown = `ninguem-${randomBytes(3).toString("hex")}@loja.test`;
    const otherIp = new Request("https://app.test/x", { headers: { "x-forwarded-for": `10.${randomBytes(3).join(".")}` } });
    expect(await authorize({ email: unknown, password: "x" }, otherIp)).toBeNull();
  });
});

/**
 * Sign-up retention (LGPD): unconfirmed sign-ups go after 7 days; rejected
 * clients 30 days after the decision, leaving only the decision in the audit
 * (date, reason, e-mail hash) — and the person can sign up again.
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const m = vi.hoisted(() => ({ db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient, sendEmail: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ get prisma() { return m.db; } }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.sendEmail, getEmailFrom: () => "test@app.test" }));

import { hashEmail } from "../lib/admin/audit";
import { setClientStatus } from "../lib/admin/clients";
import { registerSignup } from "../lib/account/signup";
import { purgeExpiredSignups } from "../lib/privacy/signup-retention";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `retention_${randomBytes(4).toString("hex")}`;
let sql: Client;
const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!databaseUrl)("sign-up retention", () => {
  beforeAll(async () => {
    vi.stubEnv("REDIS_URL", process.env.REDIS_URL ?? "redis://localhost:6379");
    vi.stubEnv("NEXTAUTH_URL", "https://app.test");
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    }
    m.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
    m.sendEmail.mockResolvedValue(undefined);
  }, 60_000);

  afterAll(async () => {
    await m.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
    vi.unstubAllEnvs();
  });

  it("deletes unconfirmed public sign-ups after 7 days, never confirmed or admin-created ones", async () => {
    const old = new Date(Date.now() - 8 * DAY);
    await m.db.user.create({ data: { id: "u_old", email: "velho@x.test", createdAt: old } });
    await m.db.workspace.create({ data: { id: "w_old", name: "Velho", ownerId: "u_old", status: "PENDING_APPROVAL", signupSource: "SELF_SIGNUP", createdAt: old, members: { create: { userId: "u_old", role: "OWNER" } } } });
    await m.db.user.create({ data: { id: "u_new", email: "novo@x.test" } });
    await m.db.workspace.create({ data: { id: "w_new", name: "Novo", ownerId: "u_new", status: "PENDING_APPROVAL", signupSource: "SELF_SIGNUP", members: { create: { userId: "u_new", role: "OWNER" } } } });
    await m.db.user.create({ data: { id: "u_ok", email: "ok@x.test", emailVerified: old, createdAt: old } });
    await m.db.workspace.create({ data: { id: "w_ok", name: "Ok", ownerId: "u_ok", status: "PENDING_APPROVAL", signupSource: "SELF_SIGNUP", createdAt: old, members: { create: { userId: "u_ok", role: "OWNER" } } } });
    await m.db.user.create({ data: { id: "u_admin", email: "convidado@x.test", createdAt: old } });
    await m.db.workspace.create({ data: { id: "w_admin", name: "Convite", ownerId: "u_admin", status: "ACTIVE", signupSource: "ADMIN", createdAt: old, members: { create: { userId: "u_admin", role: "OWNER" } } } });

    const result = await purgeExpiredSignups();
    expect(result.unconfirmedSignupsDeleted).toBe(1);
    expect(await m.db.user.findUnique({ where: { id: "u_old" } })).toBeNull();
    expect(await m.db.workspace.findUnique({ where: { id: "w_old" } })).toBeNull();
    for (const id of ["u_new", "u_ok", "u_admin"]) expect(await m.db.user.count({ where: { id } })).toBe(1);
  });

  it("30 days after a rejection, deletes the personal data and keeps only the decision in the audit", async () => {
    await m.db.user.create({ data: { id: "u_rej", email: "Recusado@x.test", name: "Recusado", emailVerified: new Date(), passwordHash: "x" } });
    await m.db.workspace.create({ data: { id: "w_rej", name: "Recusada", ownerId: "u_rej", status: "PENDING_APPROVAL", signupSource: "SELF_SIGNUP", companyName: "Recusada LTDA", contactPhone: "+5511999990000", documentType: "CPF", documentNumber: "52998224725", members: { create: { userId: "u_rej", role: "OWNER" } } } });
    await m.db.adminAuditLog.create({ data: { actorEmail: "dono@plataforma.test", workspaceId: "w_rej", action: "client.notes", after: { internalNotes: "Ligou do 11 99999-0000" } } });
    await setClientStatus("dono@plataforma.test", "w_rej", "reject", "Fora do perfil atendido");

    // 29 days later: nothing is deleted yet.
    expect((await purgeExpiredSignups(new Date(Date.now() + 29 * DAY))).rejectedClientsDeleted).toBe(0);
    expect(await m.db.user.count({ where: { id: "u_rej" } })).toBe(1);

    const result = await purgeExpiredSignups(new Date(Date.now() + 31 * DAY));
    expect(result.rejectedClientsDeleted).toBe(1);
    expect(await m.db.user.findUnique({ where: { id: "u_rej" } })).toBeNull();
    expect(await m.db.workspace.findUnique({ where: { id: "w_rej" } })).toBeNull();

    const remaining = await m.db.adminAuditLog.findMany({ where: { subjectEmailHash: hashEmail("recusado@x.test") } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      action: "client.reject",
      reason: "Fora do perfil atendido",
      workspaceId: null,
      before: null,
      after: null,
      subjectEmailHash: hashEmail("recusado@x.test"),
    });
    // The notes with personal data are gone; nothing mentions the e-mail in clear.
    const all = JSON.stringify(await m.db.adminAuditLog.findMany());
    expect(all).not.toMatch(/99999-0000|recusado@x\.test|Recusada LTDA/i);

    // The person can sign up again.
    const again = await registerSignup(
      { name: "Recusado", email: "recusado@x.test", password: "senha-nova-2026", companyName: "Nova tentativa", phone: "(11) 99999-0000", acceptTerms: true },
      { ip: `198.19.${randomBytes(1)[0]}.${randomBytes(1)[0]}` }
    );
    expect(again).toEqual({ ok: true });
    expect(await m.db.user.count({ where: { email: "recusado@x.test" } })).toBe(1);
  });
});

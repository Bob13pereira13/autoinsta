/**
 * Public sign-up, e-mail confirmation, sign-in and the "only ACTIVE clients
 * reach the dashboard" rule, on a real Postgres and the local Redis.
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
  userId: null as string | null,
  sendEmail: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ get prisma() { return m.db; } }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.sendEmail, getEmailFrom: () => "test@app.test" }));
vi.mock("@/lib/auth", () => ({
  getCurrentUserId: async () => m.userId,
  getCurrentWorkspaceId: async () => (m.userId ? (await import("../lib/workspace")).resolveActiveWorkspaceId(m.userId) : null),
  auth: async () => (m.userId ? { user: { id: m.userId } } : null),
}));

import { POST as signupRoute } from "../app/api/signup/route";
import { POST as resendRoute } from "../app/api/signup/resend/route";
import { GET as automationsGet } from "../app/api/automations/route";
import { AccountDisabledError, authorizeWithPassword, EmailNotVerifiedError } from "../lib/account/authorize";
import { confirmSignupEmail, LEGAL_VERSION } from "../lib/account/signup";
import { setPasswordWithToken } from "../lib/account/tokens";
import { getCurrentWorkspaceContext } from "../lib/workspace-access";
import { resolveActiveWorkspaceId } from "../lib/workspace";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `signup_${randomBytes(4).toString("hex")}`;
let sql: Client;
const run = randomBytes(3).toString("hex");
let ipSeq = 0;
// A fresh "Traefik-appended" IP per test, so Redis counters from other runs do not interfere.
const freshIp = () => `198.18.${parseInt(run.slice(0, 2), 16)}.${(ipSeq += 1)}`;

function signupRequest(body: Record<string, unknown>, xff: string) {
  return new NextRequest("https://app.test/api/signup", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": xff },
  });
}
const valid = (email: string, extra: Record<string, unknown> = {}) => ({
  name: "Maria Souza",
  email,
  password: "senha-forte-2026",
  companyName: "Loja da Maria",
  phone: "(11) 99999-8888",
  document: "529.982.247-25",
  acceptTerms: true,
  locale: "pt-BR",
  ...extra,
});
const tokenFromLastEmail = () => {
  const call = m.sendEmail.mock.calls[m.sendEmail.mock.calls.length - 1][0] as { text: string };
  return new URL(call.text.match(/https:\/\/app\.test\/confirmar-email\?token=[^\s]+/)![0]).searchParams.get("token")!;
};

describe.skipIf(!databaseUrl)("public sign-up", () => {
  beforeAll(async () => {
    vi.stubEnv("REDIS_URL", process.env.REDIS_URL ?? "redis://localhost:6379");
    vi.stubEnv("NEXTAUTH_URL", "https://app.test");
    vi.stubEnv("ADMIN_EMAILS", "dono@plataforma.test, socio@plataforma.test");
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    }
    m.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
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
    m.sendEmail.mockReset();
    m.sendEmail.mockResolvedValue(undefined);
    m.userId = null;
  });

  it("creates an unconfirmed user and a PENDING_APPROVAL workspace, recording the accepted terms", async () => {
    const email = `maria-${run}@loja.test`;
    const res = await signupRoute(signupRequest(valid(email.toUpperCase()), freshIp()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const user = await m.db.user.findUniqueOrThrow({ where: { email }, include: { workspaceMembers: { include: { workspace: true } } } });
    expect(user.emailVerified).toBeNull();
    expect(user.termsVersion).toBe(LEGAL_VERSION);
    expect(Date.now() - user.termsAcceptedAt!.getTime()).toBeLessThan(60_000);
    const ws = user.workspaceMembers[0].workspace;
    expect(ws).toMatchObject({
      status: "PENDING_APPROVAL", signupSource: "SELF_SIGNUP", companyName: "Loja da Maria",
      contactPhone: "+5511999998888", documentType: "CPF", documentNumber: "52998224725",
      // Follows the platform default limit.
      instagramAccountLimit: null,
    });
    expect(user.workspaceMembers[0].role).toBe("OWNER");
    // The confirmation link went to the user, not to the admins yet.
    expect(m.sendEmail).toHaveBeenCalledTimes(1);
    expect(m.sendEmail.mock.calls[0][0].to).toBe(email);
  });

  it("an unconfirmed e-mail cannot sign in; a wrong password reveals nothing", async () => {
    const email = `nao-confirmado-${run}@loja.test`;
    await signupRoute(signupRequest(valid(email), freshIp()));
    await expect(authorizeWithPassword({ email, password: "senha-forte-2026" })).rejects.toBeInstanceOf(EmailNotVerifiedError);
    expect(await authorizeWithPassword({ email, password: "errada-123456" })).toBeNull();
  });

  it("confirming the e-mail lets the pending client sign in, notifies the admins once, and the link cannot set a password", async () => {
    const email = `confirma-${run}@loja.test`;
    await signupRoute(signupRequest(valid(email), freshIp()));
    const token = tokenFromLastEmail();
    expect((await setPasswordWithToken(token, "outra-senha-2026")).ok).toBe(false);

    m.sendEmail.mockClear();
    expect(await confirmSignupEmail(token)).toBe(true);
    const notified = m.sendEmail.mock.calls.map((c) => c[0].to).sort();
    expect(notified).toEqual(["dono@plataforma.test", "socio@plataforma.test"]);
    const ws = await m.db.workspace.findFirstOrThrow({ where: { owner: { email } } });
    expect(m.sendEmail.mock.calls[0][0].text).toContain(`https://app.test/admin/clients/${ws.id}`);
    expect(await confirmSignupEmail(token)).toBe(false);
    expect(m.sendEmail).toHaveBeenCalledTimes(2);

    expect(await authorizeWithPassword({ email, password: "senha-forte-2026" })).toMatchObject({ email });
  });

  it("a pending client does not reach the dashboard APIs until approved", async () => {
    const email = `pendente-${run}@loja.test`;
    await signupRoute(signupRequest(valid(email), freshIp()));
    await confirmSignupEmail(tokenFromLastEmail());
    const user = await m.db.user.findUniqueOrThrow({ where: { email } });
    m.userId = user.id;

    expect(await resolveActiveWorkspaceId(user.id)).toBeNull();
    expect(await getCurrentWorkspaceContext()).toBeNull();
    expect((await automationsGet(new NextRequest("https://app.test/api/automations"))).status).toBe(401);

    await m.db.workspace.updateMany({ where: { ownerId: user.id }, data: { status: "ACTIVE" } });
    expect(await resolveActiveWorkspaceId(user.id)).toEqual(expect.any(String));
    expect((await automationsGet(new NextRequest("https://app.test/api/automations"))).status).toBe(200);

    for (const status of ["REJECTED", "DISABLED"] as const) {
      await m.db.workspace.updateMany({ where: { ownerId: user.id }, data: { status } });
      expect((await automationsGet(new NextRequest("https://app.test/api/automations"))).status).toBe(401);
    }
  });

  it("a disabled client is turned away at sign-in; pending and rejected ones may sign in to see their status", async () => {
    const email = `status-${run}@loja.test`;
    await signupRoute(signupRequest(valid(email), freshIp()));
    await confirmSignupEmail(tokenFromLastEmail());
    const set = (status: "DISABLED" | "REJECTED" | "PENDING_APPROVAL") => m.db.workspace.updateMany({ where: { owner: { email } }, data: { status } });
    await set("DISABLED");
    await expect(authorizeWithPassword({ email, password: "senha-forte-2026" })).rejects.toBeInstanceOf(AccountDisabledError);
    await set("REJECTED");
    expect(await authorizeWithPassword({ email, password: "senha-forte-2026" })).toMatchObject({ email });
    await set("PENDING_APPROVAL");
    expect(await authorizeWithPassword({ email, password: "senha-forte-2026" })).toMatchObject({ email });
  });

  it("an e-mail that already has an account gets the same answer and an e-mail, never a second account", async () => {
    const email = `existe-${run}@loja.test`;
    await m.db.user.create({ data: { email, emailVerified: new Date(), name: "Já cliente" } });
    m.sendEmail.mockClear();
    const res = await signupRoute(signupRequest(valid(email, { name: "Outra pessoa" }), freshIp()));
    expect(await res.json()).toEqual({ success: true });
    expect(await m.db.user.count({ where: { email } })).toBe(1);
    expect(m.sendEmail).toHaveBeenCalledTimes(1);
    expect(m.sendEmail.mock.calls[0][0].subject).toBe("Você já tem uma conta");
  });

  it("validates the fields on the server, including the CPF/CNPJ check digits", async () => {
    const bad = async (extra: Record<string, unknown>) => {
      const res = await signupRoute(signupRequest(valid(`invalido-${randomBytes(3).toString("hex")}@loja.test`, extra), freshIp()));
      return { status: res.status, body: await res.json() };
    };
    expect(await bad({ document: "529.982.247-24" })).toMatchObject({ status: 400, body: { field: "document" } });
    expect(await bad({ document: "12.ABC.345/01DE-35" })).toMatchObject({ status: 200 });
    expect(await bad({ document: "" })).toMatchObject({ status: 200 });
    expect(await bad({ phone: "123" })).toMatchObject({ status: 400, body: { field: "phone" } });
    expect(await bad({ acceptTerms: false })).toMatchObject({ status: 400, body: { field: "acceptTerms" } });
    expect(await bad({ password: "1234567" })).toMatchObject({ status: 400, body: { field: "password" } });
  });

  it("limits attempts per IP — a forged X-Forwarded-For does not get around it", async () => {
    const realIp = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      // The visitor makes up a different address every time; Traefik appends the real one.
      const forged = `${10 + i}.${i}.${i}.${i}, 203.0.113.${i}`;
      const res = await signupRoute(signupRequest(valid(`ip-${run}-${i}@loja.test`), `${forged}, ${realIp}`));
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429]);
    // Another visitor is not affected.
    expect((await signupRoute(signupRequest(valid(`outro-ip-${run}@loja.test`), freshIp()))).status).toBe(200);
  });

  it("caps e-mails to one address and the resend answer reveals nothing", async () => {
    const email = `reenvio-${run}@loja.test`;
    await signupRoute(signupRequest(valid(email), freshIp()));
    m.sendEmail.mockClear();
    const resend = (to: string) =>
      resendRoute(new NextRequest("https://app.test/api/signup/resend", { method: "POST", body: JSON.stringify({ email: to }), headers: { "content-type": "application/json", "x-forwarded-for": freshIp() } }));
    for (let i = 0; i < 4; i++) expect((await (await resend(email)).json()).success).toBe(true);
    // 3 per hour per address: the sign-up used one, so two more went out.
    expect(m.sendEmail).toHaveBeenCalledTimes(2);
    m.sendEmail.mockClear();
    expect((await (await resend(`ninguem-${run}@loja.test`)).json()).success).toBe(true);
    expect(m.sendEmail).not.toHaveBeenCalled();
  });

  it("checks Turnstile on the server when the secret is set", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await signupRoute(signupRequest(valid(`robo-${run}@loja.test`, { turnstileToken: "fake" }), freshIp()));
      expect(res.status).toBe(400);
      expect((await res.json()).field).toBe("turnstile");
      expect(await m.db.user.count({ where: { email: `robo-${run}@loja.test` } })).toBe(0);
      const body = (fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
      expect(body.get("secret")).toBe("secret");
      expect(body.get("response")).toBe("fake");
    } finally {
      vi.unstubAllGlobals();
      vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    }
  });
});

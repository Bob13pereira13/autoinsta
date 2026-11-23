/**
 * E-mail failures on a real Postgres: whatever the e-mail (sign-up, sent
 * again, welcome, admin notice, password recovery…), a failed send becomes an
 * event in the admin's Diagnostics with the e-mail's kind, the recipient
 * masked (b***@gmail.com) and the provider's own message; the admin's
 * "Send test e-mail" answers with the result or that exact error. Resend is
 * simulated through fetch; the SMTP path through nodemailer.
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
  smtp: { sendMail: undefined as undefined | ((message: unknown) => Promise<unknown>) },
}));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/admin/auth", () => ({ getAdminEmail: async () => "ops@empresa.test", adminForbidden: () => new Response(null, { status: 403 }) }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: (m: unknown) => state.smtp.sendMail!(m) }) } }));

import { maskEmail, sendEmail } from "../lib/email/send";
import { requestPasswordReset, sendWelcomeEmail } from "../lib/account/tokens";
import { notifyAdminsOfSignup, resendConfirmation } from "../lib/account/signup";
import { POST as emailTestRoute } from "../app/api/admin/email-test/route";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `email_${randomBytes(4).toString("hex")}`;
let sql: Client;

const fetchMock = vi.fn();
const resendRefuses = (status: number, body: unknown) =>
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(body), { status }));
const resendAccepts = (id = "re_123") => fetchMock.mockImplementation(async () => new Response(JSON.stringify({ id }), { status: 200 }));
const events = () => state.db.operationalEvent.findMany({ where: { message: { startsWith: "E-mail not sent" } }, orderBy: { createdAt: "asc" } });

describe.skipIf(!databaseUrl)("e-mail failures go to Diagnostics", () => {
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
  }, 60_000);

  beforeEach(async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    vi.stubEnv("NEXTAUTH_URL", "https://app.test");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_SERVER", "");
    vi.stubEnv("EMAIL_FROM", "ChatIntegrAI <nao-responda@chatintegrai.com>");
    await state.db.operationalEvent.deleteMany();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  it("masks the recipient: b***@gmail.com", () => {
    expect(maskEmail("bob13pereira@gmail.com")).toBe("b***@gmail.com");
    expect(maskEmail("x@empresa.com.br")).toBe("x***@empresa.com.br");
    expect(maskEmail("not-an-address")).toBe("***");
  });

  it("password recovery refused by Resend → event with kind, masked recipient and Resend's message; the form answers the same", async () => {
    const email = `cliente-${randomBytes(3).toString("hex")}@gmail.com`;
    await state.db.user.create({ data: { email, name: "Cliente" } });
    resendRefuses(403, { statusCode: 403, name: "validation_error", message: "The chatintegrai.com domain is not verified. Please, add and verify your domain on https://resend.com/domains" });
    await expect(requestPasswordReset(email)).resolves.toBeUndefined(); // the person sees the usual message
    const [event] = await events();
    expect(event).toMatchObject({ source: "SYSTEM", level: "ERROR", message: `E-mail not sent: password recovery to c***@gmail.com` });
    expect(event.payload).toEqual({
      kind: "password_reset",
      to: "c***@gmail.com",
      provider: "resend",
      status: 403,
      error: "validation_error: The chatintegrai.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
    });
    // Never the whole address, never the token or the link.
    expect(JSON.stringify(event)).not.toContain(email);
    expect(JSON.stringify(event)).not.toContain("/redefinir-senha");
  });

  it("the sign-up confirmation sent again, the welcome invitation and the admin notice are recorded with their own kind", async () => {
    const pending = `novo-${randomBytes(3).toString("hex")}@empresa.test`;
    await state.db.user.create({ data: { email: pending, name: "Novo" } });
    resendRefuses(429, { name: "rate_limit_exceeded", message: "Too many requests. You can only make 2 requests per second." });
    await resendConfirmation(pending, { ip: null });

    const invited = await state.db.user.create({ data: { email: `convite-${randomBytes(3).toString("hex")}@empresa.test`, name: "Convite" } });
    await expect(sendWelcomeEmail(invited.id)).rejects.toThrow(/rate_limit_exceeded/);

    // Two admins: the first refused, the second still gets the notice.
    vi.stubEnv("ADMIN_EMAILS", "dono@empresa.test, ops@empresa.test");
    const owner = await state.db.user.create({ data: { email: `loja-${randomBytes(3).toString("hex")}@empresa.test`, name: "Loja" } });
    const ws = await state.db.workspace.create({ data: { name: "Loja", ownerId: owner.id, signupSource: "SELF_SIGNUP", status: "PENDING_APPROVAL" } });
    await state.db.workspaceMember.create({ data: { workspaceId: ws.id, userId: owner.id, role: "OWNER" } });
    fetchMock.mockReset();
    fetchMock
      .mockImplementationOnce(async () => new Response(JSON.stringify({ name: "validation_error", message: "Invalid `to` field." }), { status: 422 }))
      .mockImplementationOnce(async () => new Response(JSON.stringify({ id: "re_ok" }), { status: 200 }));
    await expect(notifyAdminsOfSignup(owner.id)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const kinds = (await events()).map((e) => (e.payload as { kind: string }).kind);
    expect(kinds).toEqual(["signup_confirmation_resend", "welcome_invitation", "admin_new_signup"]);
    const notice = (await events())[2];
    expect(notice.message).toBe("E-mail not sent: new sign-up notice to the admin to d***@empresa.test");
    expect(notice.payload).toMatchObject({ status: 422, error: "validation_error: Invalid `to` field." });
  });

  it("SMTP (EMAIL_SERVER) failures keep the server's words; no provider configured says so", async () => {
    vi.stubEnv("EMAIL_SERVER", "smtps://login%40empresa.test:senha@smtp.empresa.test:465");
    state.smtp.sendMail = async () => {
      throw Object.assign(new Error("Invalid login: 535 5.7.8 Authentication failed"), { responseCode: 535 });
    };
    await expect(sendEmail({ kind: "magic_link", to: "bob@gmail.com", subject: "s", html: "h", text: "t" })).rejects.toThrow(/535/);
    vi.stubEnv("EMAIL_SERVER", "");
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendEmail({ kind: "account_ready", to: "ana@gmail.com", subject: "s", html: "h", text: "t" })).rejects.toThrow(/Configure EMAIL_SERVER or RESEND_API_KEY/);
    const [smtp, none] = await events();
    expect(smtp.payload).toEqual({ kind: "magic_link", to: "b***@gmail.com", provider: "smtp", status: 535, error: "Invalid login: 535 5.7.8 Authentication failed" });
    expect(none.payload).toMatchObject({ kind: "account_ready", to: "a***@gmail.com", provider: "none" });
  });

  it("a sent e-mail records nothing", async () => {
    resendAccepts();
    await expect(sendEmail({ kind: "client_approved", to: "bob@gmail.com", subject: "s", html: "h", text: "t" })).resolves.toEqual({ provider: "resend", id: "re_123" });
    expect(await events()).toEqual([]);
  });

  describe("admin Settings → Send test e-mail", () => {
    const send = (body: unknown) =>
      emailTestRoute(new NextRequest("https://app.test/api/admin/email-test", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

    it("sent: to the admin's own address by default, with the provider, the sender and Resend's id", async () => {
      resendAccepts("re_abc");
      const res = await (await send({})).json();
      expect(res).toEqual({
        success: true,
        data: { sent: true, to: "ops@empresa.test", from: "ChatIntegrAI <nao-responda@chatintegrai.com>", provider: "resend", server: null, id: "re_abc" },
      });
      const request = JSON.parse(String(fetchMock.mock.calls[0][1].body));
      expect(request).toMatchObject({ to: "ops@empresa.test", subject: "E-mail de teste do ChatIntegrAI" });
    });

    it("not sent: the provider's exact error on screen, and in Diagnostics", async () => {
      resendRefuses(403, { name: "validation_error", message: "You can only send testing emails to your own email address (bob@x.test)." });
      const res = await (await send({ to: "cliente@gmail.com" })).json();
      expect(res.data).toMatchObject({
        sent: false,
        to: "cliente@gmail.com",
        provider: "resend",
        status: 403,
        error: "validation_error: You can only send testing emails to your own email address (bob@x.test).",
      });
      expect((await events())[0].payload).toMatchObject({ kind: "test", to: "c***@gmail.com" });
    });

    it("an invalid address is refused before anything is sent", async () => {
      const res = await send({ to: "nope" });
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

describe("every e-mail the app sends says which one it is", () => {
  it("no sendEmail call without a kind", () => {
    const files = ["lib/account/signup.ts", "lib/account/tokens.ts", "lib/admin/clients.ts", "lib/auth.ts", "app/api/admin/email-test/route.ts"];
    for (const file of files) {
      const source = readFileSync(path.join(__dirname, "..", file), "utf8");
      for (const call of source.matchAll(/sendEmail\(\{([^}]*)/g)) expect(call[1], file).toMatch(/kind[,:]/);
    }
  });
});

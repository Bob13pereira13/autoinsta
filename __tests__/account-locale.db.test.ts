/**
 * Language on sign-in, on a real Postgres: a browser without the language
 * cookie takes the language saved on the account (User.locale) and keeps it in
 * the cookie; a browser that already chose a language keeps its choice. The
 * App Review account is saved in English, so the reviewer lands in English.
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
  jar: new Map<string, string>(),
  failCookies: false,
}));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));
const store = vi.hoisted(() => ({
  get: vi.fn((name: string) => (state.jar.has(name) ? { name, value: state.jar.get(name) } : undefined)),
  set: vi.fn((name: string, value: string) => void state.jar.set(name, value)),
}));
vi.mock("next/headers", () => ({
  cookies: async () => {
    if (state.failCookies) throw new Error("cookies() called outside a request");
    return store;
  },
}));

import { adoptAccountLocale } from "../lib/i18n/account-locale";
import { LOCALE_COOKIE } from "../lib/i18n";
import { resetReviewAccount } from "../lib/review/demo-account";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `locale_${randomBytes(4).toString("hex")}`;
let sql: Client;

describe.skipIf(!databaseUrl)("language on sign-in", () => {
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

  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  beforeEach(() => {
    state.jar.clear();
    state.failCookies = false;
    vi.clearAllMocks();
  });

  it("no language cookie yet: the account's language is used and written to the cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const user = await state.db.user.create({ data: { email: `en-${randomBytes(3).toString("hex")}@x.test`, locale: "en" } });
    await adoptAccountLocale(user.id);
    expect(store.set).toHaveBeenCalledExactlyOnceWith(LOCALE_COOKIE, "en", {
      path: "/",
      maxAge: 31_536_000,
      sameSite: "lax",
      httpOnly: true,
      secure: true,
    });
    expect(state.jar.get(LOCALE_COOKIE)).toBe("en");
    vi.unstubAllEnvs();
  });

  it("a browser that already chose a language keeps it (the account is not even read)", async () => {
    const user = await state.db.user.create({ data: { email: `kept-${randomBytes(3).toString("hex")}@x.test`, locale: "en" } });
    state.jar.set(LOCALE_COOKIE, "pt-BR");
    const findUnique = vi.spyOn(state.db.user, "findUnique");
    await adoptAccountLocale(user.id);
    expect(store.set).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(state.jar.get(LOCALE_COOKIE)).toBe("pt-BR");
    findUnique.mockRestore();
  });

  it("an account without a language, or with an unknown one, changes nothing", async () => {
    const none = await state.db.user.create({ data: { email: `none-${randomBytes(3).toString("hex")}@x.test` } });
    const odd = await state.db.user.create({ data: { email: `odd-${randomBytes(3).toString("hex")}@x.test`, locale: "fr" } });
    await adoptAccountLocale(none.id);
    await adoptAccountLocale(odd.id);
    await adoptAccountLocale("no-such-user");
    expect(store.set).not.toHaveBeenCalled();
  });

  it("never breaks the sign-in", async () => {
    state.failCookies = true;
    await expect(adoptAccountLocale("anyone")).resolves.toBeUndefined();
  });

  it("the App Review account is saved in English, so the reviewer lands in English", async () => {
    const review = await resetReviewAccount(state.db, { email: "reviewer@demo.test", password: "reviewer-pass-2026", linkUrl: "https://app.test", sampleLogs: false });
    await adoptAccountLocale(review.userId);
    expect(state.jar.get(LOCALE_COOKIE)).toBe("en");
  });
});

describe("wired into sign-in", () => {
  it("Auth.js runs it on every successful sign-in (password and e-mail link)", () => {
    const source = readFileSync(path.join(__dirname, "..", "lib/auth.ts"), "utf8");
    expect(source).toMatch(/async signIn\(\{ user \}\) \{\s*if \(user\?\.id\) await adoptAccountLocale\(user\.id\);/);
  });
});

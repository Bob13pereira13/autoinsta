/**
 * Saving through the API on a real Postgres: the response lists, apart, the
 * conflicts with other active automations (one of the two stops answering: a
 * warning) and the splits (each answers its part: information), never
 * blocking the save; and texts that
 * would not go out whole are refused (1000 bytes of plain text, 640
 * characters above a button, 20 per button label, no stray {link}).
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
vi.mock("@/lib/auth", () => ({ getCurrentWorkspaceId: async () => "w1" }));
vi.mock("@/lib/workspace-access", () => ({
  getCurrentWorkspaceContext: async () => ({ userId: "u1", workspaceId: "w1", role: "OWNER" }),
  canManageWorkspace: () => true,
}));

import { POST, PATCH } from "../app/api/automations/route";
import { RULE_MESSAGES } from "../lib/automation/rules";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `conflicts_${randomBytes(4).toString("hex")}`;
let sql: Client;

const req = (method: string, body: unknown, query = "") =>
  new NextRequest(`https://app.test/api/automations${query}`, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

const comments = (over: Record<string, unknown> = {}) => ({
  name: "Link",
  type: "COMMENTS",
  instagramAccountId: "acc1",
  keywords: ["LINK"],
  matchAnyWord: false,
  matchAnyPost: true,
  dmMessage: "Oi {username}! Aqui está: {link}",
  trackedDestinationUrl: "https://loja.test/catalogo",
  ...over,
});

async function save(body: unknown, query = "", method = "POST") {
  const res = await (method === "POST" ? POST(req("POST", body)) : PATCH(req("PATCH", body, query)));
  return { status: res.status, json: await res.json() };
}

describe.skipIf(!databaseUrl)("saving: conflicts and Instagram's limits", () => {
  beforeAll(async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://app.test");
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
    await state.db.instagramAccount.create({ data: { id: "acc2", workspaceId: "w1", instagramId: "ig2", username: "outra", accessToken: "enc" } });
    await state.db.instagramAccount.create({ data: { id: "acc3", workspaceId: "w1", instagramId: "ig3", username: "terceira", accessToken: "enc" } });
  }, 60_000);

  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
    vi.unstubAllEnvs();
  });

  describe("conflicts", () => {
    it("the second automation with the same keyword is saved, with the conflict listed", async () => {
      const first = await save(comments({ name: "Catálogo" }));
      expect(first.status).toBe(201);
      expect(first.json.conflicts).toEqual([]);
      expect(first.json.splits).toEqual([]);

      const second = await save(comments({ name: "Catálogo 2", keywords: ["link"] }));
      expect(second.status).toBe(201);
      expect(second.json.conflicts).toEqual([
        expect.objectContaining({ kind: "conflict", other: { id: first.json.data.id, name: "Catálogo" }, winner: "other", reason: "older", keyword: "link", where: "allPosts", never: true }),
      ]);
      expect(second.json.splits).toEqual([]);

      // Changing the keyword clears it; a paused save lists nothing.
      const changed = await save({ keywords: ["PRECO"] }, `?id=${second.json.data.id}`, "PATCH");
      expect(changed.status).toBe(200);
      expect(changed.json.conflicts).toEqual([]);
      const paused = await save({ keywords: ["link"], isActive: false }, `?id=${second.json.data.id}`, "PATCH");
      expect(paused.json.conflicts).toEqual([]);
    });

    it("one with a keyword and one without: information on both sides, not a conflict; other accounts never meet", async () => {
      const any = await save(comments({ name: "Qualquer", keywords: [], matchAnyWord: true, instagramAccountId: "acc2" }));
      const keyword = await save(comments({ name: "Com palavra", keywords: ["cupom", "acesso"], instagramAccountId: "acc2" }));
      expect(keyword.json.conflicts).toEqual([]);
      expect(keyword.json.splits).toEqual([
        expect.objectContaining({ kind: "split", other: { id: any.json.data.id, name: "Qualquer" }, winner: "this", reason: "keyword", keywords: ["cupom", "acesso"], never: false }),
      ]);
      // Saving the other one tells the same from its side. acc1's automations are not listed for acc2.
      const again = await save({ name: "Qualquer" }, `?id=${any.json.data.id}`, "PATCH");
      expect(again.json.conflicts).toEqual([]);
      expect(again.json.splits).toEqual([expect.objectContaining({ kind: "split", other: { id: keyword.json.data.id, name: "Com palavra" }, winner: "other" })]);
    });

    it("one on specific posts and one on all posts: information on both sides", async () => {
      const all = await save(comments({ name: "Todas", keywords: [], matchAnyWord: true, instagramAccountId: "acc3" }));
      const specific = await save(comments({ name: "Lançamento", keywords: [], matchAnyWord: true, matchAnyPost: false, postIds: ["p1"], instagramAccountId: "acc3" }));
      expect(specific.status).toBe(201);
      expect(specific.json.conflicts).toEqual([]);
      expect(specific.json.splits).toEqual([expect.objectContaining({ kind: "split", reason: "specific", winner: "this", winnerScope: "posts" })]);
      const again = await save({ name: "Todas" }, `?id=${all.json.data.id}`, "PATCH");
      expect(again.json.conflicts).toEqual([]);
      expect(again.json.splits).toEqual([expect.objectContaining({ kind: "split", other: { id: specific.json.data.id, name: "Lançamento" }, winner: "other" })]);

      // A second one on all posts without keyword: now a conflict with “Todas”, still a split with “Lançamento”.
      const twin = await save(comments({ name: "Todas 2", keywords: [], matchAnyWord: true, instagramAccountId: "acc3" }));
      expect(twin.json.conflicts).toEqual([expect.objectContaining({ kind: "conflict", other: { id: all.json.data.id, name: "Todas" }, reason: "older" })]);
      expect(twin.json.splits).toEqual([expect.objectContaining({ kind: "split", other: { id: specific.json.data.id, name: "Lançamento" } })]);
    });
  });

  describe("limits", () => {
    const fieldError = (json: { details?: { fieldErrors?: Record<string, string[]> } }, field: string) => json.details?.fieldErrors?.[field]?.[0];

    it("plain text: 1000 bytes (500 accented letters fit, 501 do not; 251 emoji do not)", async () => {
      const plain = { trackedDestinationUrl: "", name: "Texto" };
      expect((await save(comments({ ...plain, dmMessage: "é".repeat(500) }))).status).toBe(201);
      const over = await save(comments({ ...plain, dmMessage: "é".repeat(501) }));
      expect(over.status).toBe(400);
      expect(fieldError(over.json, "dmMessage")).toBe(RULE_MESSAGES.textTooLong);
      expect((await save(comments({ ...plain, dmMessage: "😀".repeat(251) }))).status).toBe(400);
    });

    it("with a link (button): 640 characters", async () => {
      expect((await save(comments({ name: "Botão", dmMessage: "é".repeat(640) + " {link}" }))).status).toBe(201);
      const over = await save(comments({ name: "Botão 2", dmMessage: "é".repeat(641) }));
      expect(fieldError(over.json, "dmMessage")).toBe(RULE_MESSAGES.buttonTextTooLong);
    });

    it("{link} without a link, {link} in the opening DM and labels over 20 are refused", async () => {
      const token = await save(comments({ name: "Sem link", trackedDestinationUrl: "", dmMessage: "Veja {link}" }));
      expect(fieldError(token.json, "dmMessage")).toBe(RULE_MESSAGES.linkTokenWithoutLink);
      const opening = await save(comments({ name: "Abertura", openingDmEnabled: true, openingDmMessage: "Tome {link}", openingDmButtonLabel: "Quero" }));
      expect(fieldError(opening.json, "openingDmMessage")).toBe(RULE_MESSAGES.linkTokenInOpeningDm);
      const label = await save(comments({ name: "Rótulo", openingDmEnabled: true, openingDmMessage: "Quer?", openingDmButtonLabel: "x".repeat(21) }));
      expect(fieldError(label.json, "openingDmButtonLabel")).toBe(RULE_MESSAGES.buttonLabelTooLong);
    });

    it("editing: removing the link while the text keeps {link} is refused; pausing is not re-checked", async () => {
      const created = await save(comments({ name: "Edição" }));
      const id = created.json.data.id;
      const removed = await save({ trackedDestinationUrl: "" }, `?id=${id}`, "PATCH");
      expect(removed.status).toBe(400);
      expect(fieldError(removed.json, "dmMessage")).toBe(RULE_MESSAGES.linkTokenWithoutLink);
      // An older automation that breaks a new rule can still be paused.
      await state.db.automation.update({ where: { id }, data: { dmMessage: "é".repeat(700) } });
      expect((await save({ isActive: false }, `?id=${id}`, "PATCH")).status).toBe(200);
    });
  });
});

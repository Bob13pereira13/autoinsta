/**
 * Step "When" of the editor, end to end on a real Postgres: what the editor
 * sends for each option is saved as that option, and the saved automation
 * opens on the same option again (GET → postScopeOf). Switching away from
 * "Specific posts" drops the checked posts; a next-reel automation that found
 * its reel reopens as "Specific posts" with the reel checked.
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

import { POST, PATCH, GET } from "../app/api/automations/route";
import { setAutomationPosts } from "../lib/automation/posts";
import { postScopeOf, postScopePayload, showsPostGrid, type PostScope, type ScopePost } from "../lib/automation/editor-scope";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `edscope_${randomBytes(4).toString("hex")}`;
let sql: Client;

const req = (method: string, body: unknown, query = "") =>
  new NextRequest(`https://app.test/api/automations${query}`, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

const marks: ScopePost[] = [
  { id: "p1", url: "https://instagram.com/p/1", publishedAt: "2026-11-01T10:00:00Z" },
  { id: "p2", url: "https://instagram.com/p/2", publishedAt: null },
];

/** What the editor sends (the parts that matter here). */
const editorBody = (scope: PostScope, posts: ScopePost[]) => ({
  name: `Escopo ${scope}`,
  type: "COMMENTS",
  instagramAccountId: "acc1",
  keywords: ["LINK"],
  matchAnyWord: false,
  dmMessage: "Oi",
  ...postScopePayload(scope, posts),
});

async function reopen(id: string) {
  const list = (await (await GET(new NextRequest("https://app.test/api/automations"))).json()).data;
  return postScopeOf(list.find((a: { id: string }) => a.id === id));
}

const postRows = (id: string) =>
  state.db.automationPost.findMany({ where: { automationId: id }, orderBy: { position: "asc" }, select: { postId: true } });

describe.skipIf(!databaseUrl)("editor: which posts trigger a Comments automation", () => {
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
  }, 60_000);

  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
    vi.unstubAllEnvs();
  });

  it("each option is saved as itself and reopens on the same option", async () => {
    for (const [scope, posts] of [
      ["all", []],
      ["posts", marks],
      ["next", []],
    ] as const) {
      const res = await POST(req("POST", editorBody(scope, [...posts])));
      expect(res.status).toBe(201);
      const { id } = (await res.json()).data;
      const row = await state.db.automation.findUniqueOrThrow({ where: { id } });
      expect({ matchAnyPost: row.matchAnyPost, pendingNextReel: row.pendingNextReel }).toEqual({
        matchAnyPost: scope === "all",
        pendingNextReel: scope === "next",
      });
      expect((await postRows(id)).map((p) => p.postId)).toEqual(posts.map((p) => p.id));
      const reopened = await reopen(id);
      expect(reopened.scope).toBe(scope);
      expect(reopened.posts.map((p) => p.id)).toEqual(posts.map((p) => p.id));
    }
  });

  it("switching from specific posts to another option does not save the checked posts", async () => {
    const { id } = (await (await POST(req("POST", editorBody("posts", marks)))).json()).data;
    expect((await postRows(id)).map((p) => p.postId)).toEqual(["p1", "p2"]);

    // The marks are still on screen, but the editor saves "all posts".
    let res = await PATCH(req("PATCH", editorBody("all", marks), `?id=${id}`));
    expect(res.status).toBe(200);
    expect(await postRows(id)).toEqual([]);
    let reopened = await reopen(id);
    expect(reopened).toEqual({ scope: "all", posts: [] });
    expect(showsPostGrid(reopened.scope)).toBe(false);

    // Back to specific posts, then to the next reel: same thing.
    res = await PATCH(req("PATCH", editorBody("posts", marks.slice(0, 1)), `?id=${id}`));
    expect(res.status).toBe(200);
    expect((await reopen(id)).posts.map((p) => p.id)).toEqual(["p1"]);
    res = await PATCH(req("PATCH", editorBody("next", marks), `?id=${id}`));
    expect(res.status).toBe(200);
    expect(await postRows(id)).toEqual([]);
    reopened = await reopen(id);
    expect(reopened).toEqual({ scope: "next", posts: [] });
  });

  it("specific posts with nothing checked is refused by the server too", async () => {
    const res = await POST(req("POST", editorBody("posts", [])));
    expect(res.status).toBe(400);
  });

  it("a next-reel automation bound to its reel reopens as specific posts with the reel checked", async () => {
    const { id } = (await (await POST(req("POST", editorBody("next", [])))).json()).data;
    // What attach-next-reel does once the reel is published.
    await state.db.$transaction(async (tx) => {
      await tx.automation.update({ where: { id }, data: { pendingNextReel: false, matchAnyPost: false } });
      await setAutomationPosts(tx, id, [{ id: "reel9", url: "https://instagram.com/reel/9", publishedAt: "2026-11-12T00:00:00Z" }]);
    });
    const reopened = await reopen(id);
    expect(reopened.scope).toBe("posts");
    expect(reopened.posts).toEqual([{ id: "reel9", url: "https://instagram.com/reel/9", publishedAt: "2026-11-12T00:00:00.000Z" }]);
    expect(showsPostGrid(reopened.scope)).toBe(true);
  });

  it("Stories: saving with neither trigger checked is refused", async () => {
    const res = await POST(req("POST", {
      name: "Stories", type: "STORIES", instagramAccountId: "acc1", matchAnyWord: true, dmMessage: "Oi",
      triggerStoryReplies: false, triggerStoryMentions: false,
    }));
    expect(res.status).toBe(400);
    const ok = await POST(req("POST", {
      name: "Stories ok", type: "STORIES", instagramAccountId: "acc1", matchAnyWord: true, dmMessage: "Oi",
      triggerStoryReplies: true, triggerStoryMentions: true,
    }));
    expect(ok.status).toBe(201);
    expect((await ok.json()).data).toMatchObject({ triggerStoryReplies: true, triggerStoryMentions: true });
  });
});

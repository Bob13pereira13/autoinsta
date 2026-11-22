/**
 * The migration that swaps the old English defaults saved on automations for
 * the Portuguese ones, on a real Postgres: only values EXACTLY equal to an old
 * default change; anything the owner typed (even close to it) stays intact.
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL,
  DEFAULT_FOLLOW_PROMPT_MESSAGE,
  DEFAULT_LINK_BUTTON_LABEL,
  DEFAULT_OPENING_BUTTON_LABEL,
} from "../lib/campaigns/defaults";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `ptdefaults_${randomBytes(4).toString("hex")}`;
const MIGRATION = "20261201120000_portuguese_customer_defaults";
const root = path.join(__dirname, "..", "prisma", "migrations");
let sql: Client;

// The exact old defaults earlier versions saved.
const OLD_FOLLOW =
  "quick favor before i send your link. i don't make any money from this, it's free. if you want to support me, just don't unfollow after, and star the repo on github if it helps you. tap the button once you're following and i'll send it over";
const OLD_FOLLOW_DM = "Almost there! Follow me and tap the button below to grab your link 💛";

type Row = { id: string; linkButtonLabel: string | null; openingDmButtonLabel: string | null; followPromptMessage: string | null; followPromptButtonLabel: string | null };
const automations: Row[] = [
  // Every old default, exactly.
  { id: "a_old", linkButtonLabel: "Open link", openingDmButtonLabel: "Send link", followPromptMessage: OLD_FOLLOW, followPromptButtonLabel: "i'm following" },
  { id: "a_old_dm", linkButtonLabel: "Open link", openingDmButtonLabel: null, followPromptMessage: OLD_FOLLOW_DM, followPromptButtonLabel: "I'm following ✅" },
  // Written by the owner: close to a default but not equal, so untouched.
  { id: "a_custom", linkButtonLabel: "Open link now", openingDmButtonLabel: "send link", followPromptMessage: `${OLD_FOLLOW} :)`, followPromptButtonLabel: "I'm following" },
  { id: "a_custom2", linkButtonLabel: "open link", openingDmButtonLabel: "Quero!", followPromptMessage: "Me segue e toca no botão 💛", followPromptButtonLabel: "Já te sigo" },
  { id: "a_spaces", linkButtonLabel: " Open link", openingDmButtonLabel: "Send link ", followPromptMessage: "", followPromptButtonLabel: "i'm following " },
  { id: "a_null", linkButtonLabel: null, openingDmButtonLabel: null, followPromptMessage: null, followPromptButtonLabel: null },
];
const links = [
  { id: "l_old", automationId: "a_old", label: "Open link" },
  { id: "l_primary", automationId: "a_old", label: "Primary campaign link" },
  { id: "l_custom", automationId: "a_custom", label: "Open the guide" },
  { id: "l_null", automationId: "a_custom2", label: null },
];

describe.skipIf(!databaseUrl)("Portuguese customer defaults migration", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const dirs = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name < MIGRATION)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    await sql.query(`INSERT INTO "User" ("id", "email", "updatedAt") VALUES ('u1', 'dono@loja.test', now())`);
    await sql.query(`INSERT INTO "Workspace" ("id", "name", "ownerId", "updatedAt") VALUES ('w1', 'Loja', 'u1', now())`);
    await sql.query(`INSERT INTO "InstagramAccount" ("id", "workspaceId", "instagramId", "username", "accessToken", "updatedAt") VALUES ('acc1', 'w1', 'ig1', 'loja', 'enc', now())`);
    for (const a of automations) {
      await sql.query(
        `INSERT INTO "Automation" ("id", "workspaceId", "instagramAccountId", "name", "keywords", "dmMessage", "matchAnyPost",
          "linkButtonLabel", "openingDmButtonLabel", "followPromptMessage", "followPromptButtonLabel", "updatedAt")
         VALUES ($1, 'w1', 'acc1', $1, '{LINK}', 'Oi {link}', true, $2, $3, $4, $5, now())`,
        [a.id, a.linkButtonLabel, a.openingDmButtonLabel, a.followPromptMessage, a.followPromptButtonLabel]
      );
    }
    for (const l of links) {
      await sql.query(
        `INSERT INTO "TrackedLink" ("id", "workspaceId", "automationId", "slug", "label", "destinationUrl", "createdAt", "updatedAt")
         VALUES ($1, 'w1', $2, $1, $3, 'https://loja.test', now(), now())`,
        [l.id, l.automationId, l.label]
      );
    }
    await sql.query(readFileSync(path.join(root, MIGRATION, "migration.sql"), "utf8"));
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  const automation = async (id: string) =>
    (
      await sql.query(
        `SELECT "linkButtonLabel", "openingDmButtonLabel", "followPromptMessage", "followPromptButtonLabel" FROM "Automation" WHERE id = $1`,
        [id]
      )
    ).rows[0];

  it("swaps every old default that matches exactly", async () => {
    expect(await automation("a_old")).toEqual({
      linkButtonLabel: DEFAULT_LINK_BUTTON_LABEL,
      openingDmButtonLabel: DEFAULT_OPENING_BUTTON_LABEL,
      followPromptMessage: DEFAULT_FOLLOW_PROMPT_MESSAGE,
      followPromptButtonLabel: DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL,
    });
    expect(await automation("a_old_dm")).toEqual({
      linkButtonLabel: "Abrir link",
      openingDmButtonLabel: null,
      followPromptMessage: "Antes de te mandar o link, segue a gente aqui? Depois é só tocar no botão abaixo.",
      followPromptButtonLabel: "Já sigo",
    });
  });

  it("leaves the owner's own texts intact, even when close to a default", async () => {
    for (const id of ["a_custom", "a_custom2", "a_spaces", "a_null"]) {
      const original = automations.find((a) => a.id === id)!;
      const { id: _id, ...expected } = original;
      void _id;
      expect(await automation(id)).toEqual(expected);
    }
  });

  it("tracked link labels: only the exact old default changes", async () => {
    const { rows } = await sql.query(`SELECT id, label FROM "TrackedLink" ORDER BY id`);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.label]))).toEqual({
      l_custom: "Open the guide",
      l_null: null,
      l_old: "Abrir link",
      l_primary: "Primary campaign link",
    });
  });

  it("running it again changes nothing", async () => {
    const before = (await sql.query(`SELECT * FROM "Automation" ORDER BY id`)).rows;
    await sql.query(readFileSync(path.join(root, MIGRATION, "migration.sql"), "utf8"));
    const after = (await sql.query(`SELECT * FROM "Automation" ORDER BY id`)).rows;
    expect(after).toEqual(before);
  });
});

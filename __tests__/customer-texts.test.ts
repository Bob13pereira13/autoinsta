/**
 * What the end customer receives by default is in Portuguese and never
 * mentions GitHub, a repository, OpenReply or the original author. Checked on
 * the default values themselves and on every file that sends or shows them
 * (worker, link handling, editor, preview, detail page, import sample); the
 * translations (lib/i18n) and every text literal of the code that reaches the
 * browser are checked for those mentions too, since they end up in the public
 * JavaScript. The fonts' licence files (app/fonts) are not code and are left
 * out.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CUSTOMER_DEFAULTS } from "@/lib/campaigns/defaults";

const FORBIDDEN = /github|\brepo\b|repository|reposit[oó]rio|openreply|ycombinator|star the/i;
// Common English words that are not also Portuguese; none belongs in a default.
const ENGLISH = new Set(
  "the an and or to of in on is it its you your here heres there open send get grab tap follow following button please thanks thank almost quick favor star now click check dms im ill dont".split(" ")
);
const words = (text: string) => (text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").match(/[a-z]+/g) ?? []).filter((w) => w !== "link");

describe("default texts sent to the end customer", () => {
  for (const [name, value] of Object.entries(CUSTOMER_DEFAULTS)) {
    it(`${name} is Portuguese and mentions nobody else`, () => {
      expect(value).not.toMatch(FORBIDDEN);
      // Words both languages share ("a", "me", "link") are not in the list.
      const english = words(value).filter((w) => ENGLISH.has(w));
      expect(english, `${name}: ${value}`).toEqual([]);
    });
  }

  it("the agreed texts", () => {
    expect(CUSTOMER_DEFAULTS).toEqual({
      DEFAULT_LINK_BUTTON_LABEL: "Abrir link",
      DEFAULT_OPENING_BUTTON_LABEL: "Me manda o link",
      DEFAULT_FOLLOW_PROMPT_MESSAGE: "Antes de te mandar o link, segue a gente aqui? Depois é só tocar no botão abaixo.",
      DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL: "Já sigo",
      DEFAULT_LINK_ONLY_TEXT: "Aqui está o seu link:",
    });
  });

  it("button defaults fit Instagram's 20 characters", () => {
    for (const label of [CUSTOMER_DEFAULTS.DEFAULT_LINK_BUTTON_LABEL, CUSTOMER_DEFAULTS.DEFAULT_OPENING_BUTTON_LABEL, CUSTOMER_DEFAULTS.DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL]) {
      expect([...label].length).toBeLessThanOrEqual(20);
    }
  });
});

describe("no old English default is left in the code that sends or shows them", () => {
  const files = [
    "lib/queue/dm-worker.ts",
    "lib/campaigns/links.ts",
    "lib/campaigns/duplicate.ts",
    "lib/campaigns/defaults.ts",
    "lib/tracking/message.ts",
    "lib/instagram/send-messages.ts",
    "components/campaign-builder.tsx",
    "components/campaign-preview.tsx",
    "app/(dashboard)/campaigns/[id]/page.tsx",
    "app/(dashboard)/campaigns/import/page.tsx",
  ];
  const OLD = /quick favor|i'm following|almost there!|here's your link|"open link"|"send link"|\bthere"/i;
  // String literals only (comments explain history and may name things).
  const literals = (source: string) =>
    source
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n")
      .match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? [];

  for (const file of files) {
    it(file, () => {
      let source = readFileSync(path.join(__dirname, "..", file), "utf8");
      // The English editor defaults (interface in English) are allowed only in
      // their own block; the worker never uses them (checked below).
      source = source.replace(/export const CUSTOMER_DEFAULTS_EN = \{[\s\S]*?\} as const;/, "");
      const bad = literals(source).filter((s) => FORBIDDEN.test(s) || OLD.test(s));
      expect(bad).toEqual([]);
    });
  }

  it("the English defaults are only for the editor in English; what the worker sends when a field is empty stays Portuguese", () => {
    const read = (file: string) => readFileSync(path.join(__dirname, "..", file), "utf8");
    for (const file of ["lib/queue/dm-worker.ts", "lib/campaigns/links.ts", "lib/tracking/message.ts", "lib/instagram/send-messages.ts"]) {
      expect(read(file), file).not.toMatch(/CUSTOMER_DEFAULTS_EN|editorDefaults/);
    }
    expect(read("components/campaign-builder.tsx")).toContain("editorDefaults(locale)");
  });
});

// "repo" as a word: "Report" and "Relatório" are fine.
const MENTIONS = /github|\brepos?\b|repository|reposit[oó]rio|openreply/i;

describe("translations (lib/i18n) mention no GitHub, repository or OpenReply", () => {
  const dir = path.join(__dirname, "..", "lib", "i18n");
  for (const name of readdirSync(dir)) {
    it(`lib/i18n/${name}`, () => {
      const text = readFileSync(path.join(dir, name), "utf8");
      if (name.endsWith(".json")) {
        const catalog = JSON.parse(text) as Record<string, string>;
        const bad = Object.entries(catalog).filter(([key, value]) => MENTIONS.test(key) || MENTIONS.test(value));
        expect(bad).toEqual([]);
      } else {
        expect(text.match(MENTIONS)).toBeNull();
      }
    });
  }
});

describe("no text literal in the code that reaches the browser mentions them", () => {
  const root = path.join(__dirname, "..");
  const skip = (rel: string) => rel.startsWith("app/generated") || rel.startsWith("app/fonts");
  function walk(rel: string): string[] {
    if (skip(rel)) return [];
    const full = path.join(root, rel);
    if (statSync(full).isDirectory()) return readdirSync(full).flatMap((name) => walk(path.join(rel, name)));
    return /\.(tsx?|json|css)$/.test(rel) ? [rel] : [];
  }
  const literals = (source: string) =>
    source
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n")
      .match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? [];

  it("app, components, lib and config", () => {
    const bad = ["app", "components", "lib", "config"]
      .flatMap(walk)
      .flatMap((file) => literals(readFileSync(path.join(root, file), "utf8")).filter((s) => MENTIONS.test(s)).map((s) => `${file}: ${s.slice(0, 80)}`));
    expect(bad).toEqual([]);
  });
});


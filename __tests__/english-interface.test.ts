/**
 * Meta App Review: with the language set to English, no screen the reviewer
 * sees has Portuguese. English is the catalog's source language (t() shows the
 * key itself in English), so what could leak is Portuguese written outside the
 * catalog: this scans every screen's source for it. The legal pages have their
 * own English versions, checked here too; the language selector is reachable
 * before signing in; the browser audit checks the rendered pages.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config as proxyConfig, proxy } from "../proxy";
import { LEGAL_LOCALE_HEADER, LEGAL_PATHS, legalPageLocale } from "@/lib/legal/paths";

const root = path.join(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

function walk(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    return statSync(path.join(root, rel)).isDirectory() ? walk(rel) : /\.(tsx?|jsx?)$/.test(name) ? [rel] : [];
  });
}

// Portuguese gives itself away by its accents and by words English never uses.
const ACCENTS = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/;
const PT_WORDS = new Set(
  ("não você para com uma seu sua pelo pela das dos também está são entrar sair senha mensagem mensagens painel salvar enviar " +
    "voltar cadastro configurações automação automações exclusão política termos privacidade comentário comentários resposta " +
    "respostas nenhum nenhuma aqui agora conta contas criar nova novo ativar desativar excluir apagar quando escolha")
    .split(" ")
);
function looksPortuguese(text: string): boolean {
  // Addresses are not text: routes (/cadastro), URLs and e-mail addresses.
  text = text.replace(/\b[\w.+-]+@[\w.-]+\b/g, " ").replace(/\bhttps?:\/\/\S+/g, " ").replace(/\b[\w-]+\.(com|br|org|net)\b(\/\S*)?/g, " ");
  if (/^\/[\w/?=&.-]*$/.test(text.trim())) return false;
  if (ACCENTS.test(text)) return true;
  return (text.toLowerCase().match(/\p{L}+/gu) ?? []).some((w) => PT_WORDS.has(w));
}

/** String literals and JSX text of a source file, comments removed. */
function texts(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const out: string[] = [];
  for (const m of code.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) out.push(m[1] ?? m[2] ?? m[3]);
  for (const m of code.matchAll(/>([^<>{}]*[\p{L}][^<>{}]*)</gu)) out.push(m[1]);
  return out.map((s) => s.trim()).filter(Boolean);
}

// Where Portuguese is the point: the Portuguese versions of the legal pages and
// their routes, the admin area (operators only), the default texts sent to
// customers in Brazil (lib/campaigns/defaults.ts) and the language's own name.
const PORTUGUESE_BY_DESIGN = [
  /^app\/admin\//,
  /^components\/admin\//,
  /^app\/(privacidade|termos|exclusao-dados)\//,
  /^components\/legal\//, // checked below, language by language
];
const ALLOWED_TEXTS = [
  "Português (Brasil)", // the language selector shows each language in its own name
  "Português",
];

describe("screens in English", () => {
  const screens = [...walk("app"), ...walk("components")].filter(
    (f) => !f.includes("generated") && !PORTUGUESE_BY_DESIGN.some((re) => re.test(f.replace(/\\/g, "/")))
  );

  it("have no Portuguese outside the translation catalog", () => {
    const offenders: string[] = [];
    for (const file of screens) {
      let source = read(file);
      // Example CSV rows per language: only the English ones show in English.
      source = source.replace(/"pt-BR":\s*`[\s\S]*?`/g, "");
      for (const text of texts(source)) {
        if (ALLOWED_TEXTS.includes(text)) continue;
        if (looksPortuguese(text)) offenders.push(`${file}: ${text.slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the language selector is there before signing in (landing, sign-in, sign-up, password pages) and the legal pages link the other language", () => {
    expect(read("app/page.tsx")).toContain("<LanguageSwitcher />");
    for (const layout of ["app/login/layout.tsx", "app/cadastro/layout.tsx", "app/esqueci-senha/layout.tsx", "app/redefinir-senha/layout.tsx", "app/confirmar-email/layout.tsx"]) {
      expect(read(layout), layout).toMatch(/localized-layout|LocalizedLayout/);
    }
    expect(read("components/localized-layout.tsx")).toContain("<LanguageSwitcher />");
    expect(read("components/legal-shell.tsx")).toContain("data-legal-language");
    // The page's own language is declared for screen readers and translators.
    expect(read("app/layout.tsx")).toMatch(/lang=\{isLocale\(legalLocale\) \? legalLocale : locale\}/);
  });
});

describe("legal pages in both languages", () => {
  const legal = ["components/legal/privacy-content.tsx", "components/legal/terms-content.tsx", "components/legal/data-deletion-content.tsx"];

  /** The source of one language's function (…En / …Pt) or text block. */
  function block(source: string, start: RegExp): string {
    const from = source.search(start);
    expect(from, String(start)).toBeGreaterThan(-1);
    const next = source.slice(from + 1).search(/\nfunction |\n {2}(en|"pt-BR"): \{/);
    return next === -1 ? source.slice(from) : source.slice(from, from + 1 + next);
  }

  it("the English versions have no Portuguese", () => {
    const offenders: string[] = [];
    const english = [
      ...legal.map((f) => [f, read(f)] as const).flatMap(([f, s]) =>
        [...s.matchAll(/\nfunction (\w+En)\(/g)].map((m) => [`${f} ${m[1]}`, block(s, new RegExp(`\\nfunction ${m[1]}\\(`))] as const)
      ),
      ["data-deletion TEXT.en", block(read("components/legal/data-deletion-content.tsx"), /\n {2}en: \{/)] as const,
    ];
    expect(english.length).toBeGreaterThanOrEqual(4);
    for (const [where, source] of english) {
      for (const text of texts(source)) {
        // Brazilian law and registry names stay as they are.
        const cleaned = text.replace(/\b(LGPD|CNPJ|CPF|ANPD)\b/g, "");
        if (looksPortuguese(cleaned)) offenders.push(`${where}: ${text.slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("both languages have the same sections", () => {
    for (const [file, pt, en] of [
      ["components/legal/privacy-content.tsx", "PrivacyPt", "PrivacyEn"],
      ["components/legal/terms-content.tsx", "TermsPt", "TermsEn"],
      ["components/legal/data-deletion-content.tsx", "InstructionsPt", "InstructionsEn"],
    ] as const) {
      const source = read(file);
      const count = (name: string, tag: string) => (block(source, new RegExp(`\\nfunction ${name}\\(`)).match(new RegExp(`<${tag}>`, "g")) ?? []).length;
      for (const tag of ["h2", "h3", "li", "tr"]) expect(count(en, tag), `${file} <${tag}>`).toBe(count(pt, tag));
    }
  });

  it("the retention periods come from the code in both languages", () => {
    const source = read("components/legal/privacy-content.tsx");
    for (const name of ["PrivacyPt", "PrivacyEn"]) {
      const body = block(source, new RegExp(`\\nfunction ${name}\\(`));
      for (const key of ["webhookEvents", "operationalEvents", "deletionRequests", "botMessages", "humanActivity"]) {
        expect(body, `${name} RETENTION_DAYS.${key}`).toContain(`RETENTION_DAYS.${key}`);
      }
      for (const key of ["finishedJobHours", "finishedJobCount", "failedJobMinutes", "echoNoteMinutes"]) {
        expect(body, `${name} QUEUE_RETENTION.${key}`).toContain(`QUEUE_RETENTION.${key}`);
      }
      expect(body).toContain('<Permissions locale="');
    }
  });

  it("every legal page has a Portuguese and an English address, both public (no sign-in) and never redirected", async () => {
    const nextConfig = (await import("../next.config")).default;
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const legalAddresses = Object.values(LEGAL_PATHS).flatMap((page) => Object.values(page) as string[]);
    expect(redirects.filter((r) => legalAddresses.includes(r.source))).toEqual([]);
    for (const [, page] of Object.entries(LEGAL_PATHS)) {
      for (const [locale, address] of Object.entries(page)) {
        expect(statSync(path.join(root, "app", address, "page.tsx")).isFile()).toBe(true);
        // The proxy runs on it only to mark its language for <html lang>:
        // without a session it lets the page through, never to the sign-in.
        expect(proxyConfig.matcher).toContain(address);
        const response = await proxy(new NextRequest(`https://app.test${address}`));
        expect(response.headers.get("location"), address).toBeNull();
        expect(response.headers.get("x-middleware-next"), address).toBe("1");
        expect(response.headers.get(`x-middleware-request-${LEGAL_LOCALE_HEADER}`), address).toBe(locale);
      }
    }
  });

  it("<html lang> follows the legal page's language (English pages say en whatever the interface language)", () => {
    expect(legalPageLocale("/privacy")).toBe("en");
    expect(legalPageLocale("/terms")).toBe("en");
    expect(legalPageLocale("/data-deletion")).toBe("en");
    expect(legalPageLocale("/privacidade")).toBe("pt-BR");
    expect(legalPageLocale("/dashboard")).toBeNull();
    expect(read("app/layout.tsx")).toContain("lang={isLocale(legalLocale) ? legalLocale : locale}");
    // Also after a client-side navigation (the root layout does not render again).
    expect(read("components/legal-shell.tsx")).toContain("<DocumentLang lang={locale} />");
  });
});

import { describe, expect, it } from "vitest";
import { brand } from "../config/brand";
import { createI18n, DEFAULT_LOCALE, resolveLocale } from "../lib/i18n";
import ptBR from "../lib/i18n/pt-BR.json";

describe("interface translations", () => {
  it("defaults to Brazilian Portuguese for absent or unsupported preferences", () => {
    expect(DEFAULT_LOCALE).toBe("pt-BR");
    for (const value of [undefined, null, "", "fr", "zh-TW", "ru", "pt", "pt-PT", "../en"]) {
      expect(resolveLocale(value)).toBe("pt-BR");
    }
    expect(resolveLocale("pt-BR")).toBe("pt-BR");
    expect(resolveLocale("en")).toBe("en");
  });

  it("renders both interface languages from the same keys", () => {
    expect(createI18n("en").t("Automations")).toBe("Automations");
    expect(createI18n("pt-BR").t("Automations")).toBe("Automações");
    expect(createI18n("pt-BR").t("Settings")).toBe("Configurações");
  });

  it("allows sentence order to differ between languages", () => {
    const values = { count: 2 };
    expect(createI18n("en").t("{count} connected accounts", values)).toBe(
      "2 connected accounts",
    );
    expect(createI18n("pt-BR").t("{count} connected accounts", values)).toBe(
      ptBR["{count} connected accounts"].replace("{count}", "2"),
    );
  });

  it("fills {brand} from config/brand.ts without the caller passing it", () => {
    expect(createI18n("en").t("Login - {brand}")).toBe(`Login - ${brand.name}`);
    expect(createI18n("pt-BR").t("Login - {brand}")).toBe(`Entrar - ${brand.name}`);
  });

  it("preserves interpolation values verbatim, including user content and zero", () => {
    const { t } = createI18n("en");
    expect(t("Hello, {name}!", { name: "{count} <b>Alex</b> $&" })).toBe(
      "Hello, {count} <b>Alex</b> $&!",
    );
    expect(createI18n("pt-BR").t("{count} checked posts", { count: 0 })).toBe(
      ptBR["{count} checked posts"].replace("{count}", "0"),
    );
  });

  it("translates display labels without changing stored codes or unknown values", () => {
    const codes = ["SENT", "OWNER", "active", "CUSTOM_STATUS"];
    expect(codes.map(createI18n("pt-BR").label)).toEqual([
      ptBR["Sent"],
      ptBR["Owner"],
      ptBR["Active"],
      "CUSTOM_STATUS",
    ]);
    expect(codes).toEqual(["SENT", "OWNER", "active", "CUSTOM_STATUS"]);
    expect(createI18n("pt-BR").label("toString")).toBe("toString");
    expect(createI18n("pt-BR").label("__proto__")).toBe("__proto__");
  });

  it("has complete, plain-text translations with matching interpolation fields", () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const [source, translation] of Object.entries(ptBR) as [string, string][]) {
      expect(translation.trim(), source).not.toBe("");
      expect(placeholders(translation), source).toEqual(placeholders(source));
      expect(source, source).not.toMatch(/&(?:[a-z]+|#\d+);/i);
    }
  });

  it("never hardcodes a product or provider name in a message key", () => {
    for (const source of Object.keys(ptBR)) {
      expect(source, source).not.toMatch(/OpenReply|Zernio/);
    }
  });
});

describe("runtime messages (API errors)", () => {
  it("translates known messages and passes unknown ones through", () => {
    const { message } = createI18n("pt-BR");
    expect(message("Campaign not found")).toBe(ptBR["Campaign not found"]);
    expect(message("Some raw Meta error (#100)")).toBe("Some raw Meta error (#100)");
    expect(message(undefined, "Failed to load posts")).toBe(ptBR["Failed to load posts"]);
    expect(message("", "Failed to load posts")).toBe(ptBR["Failed to load posts"]);
    expect(message("toString")).toBe("toString");
  });

  it("returns the English source unchanged in English", () => {
    expect(createI18n("en").message("Campaign not found")).toBe("Campaign not found");
  });
});

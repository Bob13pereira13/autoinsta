import { afterEach, describe, expect, it, vi } from "vitest";
import { brand, legalLastUpdatedLabel, missingBrandFields, PLACEHOLDER } from "@/config/brand";
import { isPlatformAdmin } from "@/lib/platform-admin";

afterEach(() => vi.unstubAllEnvs());

describe("brand configuration", () => {
  it("lists every field still marked [PREENCHER], by path", () => {
    expect(
      missingBrandFields({ name: "X", legal: { cnpj: PLACEHOLDER, address: "Rua A" }, support: { email: PLACEHOLDER } })
    ).toEqual(["legal.cnpj", "support.email"]);
    expect(missingBrandFields({ name: "X", colors: { primary: "#000" } })).toEqual([]);
  });

  it("has every brand and legal field filled in (no [PREENCHER] left)", () => {
    expect(missingBrandFields()).toEqual([]);
  });

  it("uses valid hex colors and a parseable legal date", () => {
    expect(brand.colors.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(brand.colors.primaryHover).toMatch(/^#[0-9a-f]{6}$/i);
    expect(legalLastUpdatedLabel()).toMatch(/\d{4}$/);
  });
});

describe("data processors (Privacy Policy, Meta's data handling questions)", () => {
  it("hosting and e-mail are named, each with the ISO code of its servers' country", () => {
    for (const processor of [brand.processors.hosting, brand.processors.email]) {
      expect(processor?.name.trim()).toBeTruthy();
      expect(processor?.country).toMatch(/^[A-Z]{2}$/);
      // A real region code: Intl knows its name.
      expect(new Intl.DisplayNames(["en"], { type: "region" }).of(processor!.country)).not.toBe(processor!.country);
    }
  });

  it("the policy names them with the country in the page's language", async () => {
    const { processorText } = await import("@/components/legal/privacy-content");
    expect(processorText({ name: "Hostinger", country: "US" }, "pt-BR")).toBe("Hostinger (servidores: Estados Unidos)");
    expect(processorText({ name: "Hostinger", country: "US" }, "en")).toBe("Hostinger (servers: United States)");
    expect(processorText({ name: "Resend, Inc.", country: "us" }, "en")).toBe("Resend, Inc. (servers: United States)");
  });
});

describe("platform administrators", () => {
  it("matches ADMIN_EMAILS case-insensitively and denies everyone else", () => {
    vi.stubEnv("ADMIN_EMAILS", "Dono@Empresa.com, ops@empresa.com");
    expect(isPlatformAdmin("dono@empresa.com")).toBe(true);
    expect(isPlatformAdmin("OPS@empresa.com")).toBe(true);
    expect(isPlatformAdmin("cliente@loja.com")).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
  });

  it("has no administrators when ADMIN_EMAILS is unset", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(isPlatformAdmin("dono@empresa.com")).toBe(false);
  });
});

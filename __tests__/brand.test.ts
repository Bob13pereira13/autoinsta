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

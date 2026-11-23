import { describe, expect, it } from "vitest";
import {
  hashPassword,
  PASSWORD_ERRORS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validateNewPassword,
  verifyPassword,
} from "@/lib/account/password";
import ptBR from "@/lib/i18n/pt-BR.json";

describe("password hashing", () => {
  it("round-trips and rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[^$]+\$[^$]+$/);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("correct horse batterY", stored)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same-password")).not.toBe(await hashPassword("same-password"));
  });

  it("treats unicode-equivalent input the same (NFKC)", async () => {
    const stored = await hashPassword("café-senha");
    expect(await verifyPassword("café-senha", stored)).toBe(true);
  });

  it("never verifies against a missing or malformed hash", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$abc")).toBe(false);
    expect(await verifyPassword("x", "plain-text-password")).toBe(false);
  });
});

describe("new password rules", () => {
  it("enforces length and rejects trivial choices", () => {
    // English catalog keys, translated where they are shown.
    expect(validateNewPassword("1234567")).toBe(PASSWORD_ERRORS.tooShort);
    expect(PASSWORD_ERRORS.tooShort).toContain(String(PASSWORD_MIN_LENGTH));
    expect(validateNewPassword("a".repeat(129))).toBe(PASSWORD_ERRORS.tooLong);
    expect(PASSWORD_ERRORS.tooLong).toContain(String(PASSWORD_MAX_LENGTH));
    expect(validateNewPassword("aaaaaaaaaa")).toBe(PASSWORD_ERRORS.predictable);
    expect(validateNewPassword("ana@loja.com", "Ana@Loja.com")).toBe(PASSWORD_ERRORS.sameAsEmail);
    for (const text of Object.values(PASSWORD_ERRORS)) expect(Object.hasOwn(ptBR, text), text).toBe(true);
    expect(validateNewPassword(undefined)).not.toBeNull();
    expect(validateNewPassword("uma senha boa 2026")).toBeNull();
  });
});

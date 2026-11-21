import { describe, expect, it } from "vitest";
import { hashPassword, validateNewPassword, verifyPassword } from "@/lib/account/password";

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
    expect(validateNewPassword("1234567")).toMatch(/8 caracteres/);
    expect(validateNewPassword("a".repeat(129))).toMatch(/128/);
    expect(validateNewPassword("aaaaaaaaaa")).toMatch(/previsível/);
    expect(validateNewPassword("ana@loja.com", "Ana@Loja.com")).toMatch(/e-mail/);
    expect(validateNewPassword(undefined)).not.toBeNull();
    expect(validateNewPassword("uma senha boa 2026")).toBeNull();
  });
});

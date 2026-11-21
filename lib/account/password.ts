import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";

/**
 * Password hashing with Node's built-in scrypt (no native dependency).
 * Stored format: scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>, so the cost
 * can be raised later without breaking existing hashes.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 64 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, KEY_LENGTH, { N: n, r, p, maxmem: MAX_MEM }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Returns a pt-BR error message, or null when the password is acceptable. */
export function validateNewPassword(password: unknown, email?: string | null): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `A senha pode ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  }
  if (/^(.)\1+$/.test(password)) {
    return "Escolha uma senha menos previsível.";
  }
  if (email && password.toLowerCase() === email.toLowerCase()) {
    return "A senha não pode ser igual ao seu e-mail.";
  }
  return null;
}

/**
 * Hash used to keep login timing the same whether or not the e-mail exists, so
 * response time does not reveal which addresses have accounts.
 */
let dummyHash: Promise<string> | null = null;
export function getDummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

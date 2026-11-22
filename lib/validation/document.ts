/**
 * CPF and CNPJ validation (check digits), for the optional document at
 * sign-up. Since July 2026 the Receita Federal also issues alphanumeric
 * CNPJs (IN RFB 2.229/2024): the first 12 characters may be 0-9 or A-Z and
 * the two check digits stay numeric. Each character counts as its ASCII code
 * minus 48 ("0" = 0 … "9" = 9, "A" = 17 … "Z" = 42), with the same weights as
 * the numeric CNPJ, so the numeric form is a special case of the same rule.
 */

export type DocumentKind = "CPF" | "CNPJ";
export interface ValidDocument {
  type: DocumentKind;
  /** Uppercase, without dots, slashes, dashes or spaces. */
  number: string;
}

/** Remove formatting; letters are kept (alphanumeric CNPJ) and uppercased. */
export function normalizeDocument(raw: string): string {
  return raw.replace(/[\s.\-/]/g, "").toUpperCase();
}

function allSame(value: string): boolean {
  return /^(.)\1+$/.test(value);
}

export function isValidCpf(raw: string): boolean {
  const cpf = normalizeDocument(raw);
  if (!/^\d{11}$/.test(cpf) || allSame(cpf)) return false;
  const digits = cpf.split("").map(Number);
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += digits[i] * (length + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== digits[length]) return false;
  }
  return true;
}

const CNPJ_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function cnpjCheckDigit(chars: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += (chars.charCodeAt(i) - 48) * weights[i];
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCnpj(raw: string): boolean {
  const cnpj = normalizeDocument(raw);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || allSame(cnpj)) return false;
  const first = cnpjCheckDigit(cnpj, CNPJ_WEIGHTS_1);
  if (first !== Number(cnpj[12])) return false;
  const second = cnpjCheckDigit(cnpj, CNPJ_WEIGHTS_2);
  return second === Number(cnpj[13]);
}

/** A valid CPF or CNPJ, or null. The kind is decided by length. */
export function parseDocument(raw: string | null | undefined): ValidDocument | null {
  if (!raw) return null;
  const number = normalizeDocument(raw);
  if (number.length === 11 && isValidCpf(number)) return { type: "CPF", number };
  if (number.length === 14 && isValidCnpj(number)) return { type: "CNPJ", number };
  return null;
}

/** 123.456.789-09 / 12.ABC.345/01DE-35 for display. */
export function formatDocument(type: DocumentKind, number: string): string {
  if (type === "CPF" && number.length === 11) {
    return `${number.slice(0, 3)}.${number.slice(3, 6)}.${number.slice(6, 9)}-${number.slice(9)}`;
  }
  if (type === "CNPJ" && number.length === 14) {
    return `${number.slice(0, 2)}.${number.slice(2, 5)}.${number.slice(5, 8)}/${number.slice(8, 12)}-${number.slice(12)}`;
  }
  return number;
}

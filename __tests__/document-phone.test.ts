import { describe, expect, it } from "vitest";
import { formatDocument, isValidCnpj, isValidCpf, parseDocument } from "../lib/validation/document";
import { normalizePhone } from "../lib/validation/phone";

describe("CPF", () => {
  it("accepts valid numbers, with or without punctuation", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("123.456.789-09")).toBe(true);
  });
  it("rejects wrong check digits, repeated digits and wrong lengths", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
    expect(isValidCpf("abc.def.ghi-jk")).toBe(false);
  });
});

describe("CNPJ", () => {
  it("accepts valid numeric CNPJs", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });
  it("accepts the alphanumeric CNPJ (Receita Federal, from July 2026)", () => {
    // The official example from the Receita Federal.
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12abc34501de35")).toBe(true);
  });
  it("rejects wrong check digits, letters in the check digits and repeated characters", () => {
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(isValidCnpj("12.ABC.345/01DE-36")).toBe(false);
    expect(isValidCnpj("12.ABC.345/01DE-3A")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
    expect(isValidCnpj("1122233300018")).toBe(false);
  });
});

describe("parseDocument", () => {
  it("decides the kind by length and normalizes", () => {
    expect(parseDocument("529.982.247-25")).toEqual({ type: "CPF", number: "52998224725" });
    expect(parseDocument("12.abc.345/01de-35")).toEqual({ type: "CNPJ", number: "12ABC34501DE35" });
    expect(parseDocument("529.982.247-24")).toBeNull();
    expect(parseDocument("")).toBeNull();
    expect(parseDocument(null)).toBeNull();
  });
  it("formats for display", () => {
    expect(formatDocument("CPF", "52998224725")).toBe("529.982.247-25");
    expect(formatDocument("CNPJ", "12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
  });
});

describe("WhatsApp number", () => {
  it("normalizes Brazilian numbers to E.164", () => {
    expect(normalizePhone("(11) 99999-8888")).toBe("+5511999998888");
    expect(normalizePhone("11 3333-4444")).toBe("+551133334444");
    expect(normalizePhone("55 11 99999-8888")).toBe("+5511999998888");
    expect(normalizePhone("+55 (21) 98888-7777")).toBe("+5521988887777");
  });
  it("accepts international numbers only with +", () => {
    expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
    // 11 digits that are not a Brazilian mobile (the 3rd digit is not 9).
    expect(normalizePhone("1 415 555 0100")).toBe(null);
  });
  it("rejects junk", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("(01) 99999-8888")).toBeNull();
    expect(normalizePhone("(11) 19999-8888")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

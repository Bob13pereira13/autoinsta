import { describe, expect, it } from "vitest";
import { effectiveAccountLimit, parseLimitInput } from "../lib/account-limit";

describe("effectiveAccountLimit", () => {
  it("own limit first, then the platform default, else no limit", () => {
    expect(effectiveAccountLimit(3, 10)).toBe(3);
    expect(effectiveAccountLimit(3, null)).toBe(3);
    expect(effectiveAccountLimit(null, 2)).toBe(2);
    expect(effectiveAccountLimit(null, null)).toBeNull();
    expect(effectiveAccountLimit(undefined, undefined)).toBeNull();
  });
});

describe("parseLimitInput", () => {
  it("empty means none; a whole number from 1 to 100 is a limit", () => {
    for (const empty of [null, undefined, ""]) expect(parseLimitInput(empty)).toEqual({ ok: true, value: null });
    expect(parseLimitInput(1)).toEqual({ ok: true, value: 1 });
    expect(parseLimitInput("12")).toEqual({ ok: true, value: 12 });
    expect(parseLimitInput(100)).toEqual({ ok: true, value: 100 });
  });
  it("rejects zero, negatives, fractions, above 100 and junk", () => {
    for (const bad of [0, -1, 1.5, 101, "abc", {}]) expect(parseLimitInput(bad).ok).toBe(false);
  });
});

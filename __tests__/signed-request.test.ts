import { createHmac } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSignedRequest,
  parseSignedRequest,
  readSignedRequestFromBody,
} from "@/lib/meta/signed-request";

afterEach(() => vi.unstubAllEnvs());

const payload = { algorithm: "HMAC-SHA256", issued_at: 1_763_700_000, user_id: "17841400000000000" };

describe("Meta signed_request", () => {
  it("accepts a request signed the way Meta signs it", () => {
    const signed = createSignedRequest(payload, "ig-secret");
    const result = parseSignedRequest(signed, ["ig-secret"]);
    expect(result).toEqual({ ok: true, payload });
  });

  it("matches Meta's reference construction byte for byte", () => {
    // base64url(HMAC-SHA256(encoded payload)) . base64url(JSON), no padding.
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", "ig-secret").update(encoded).digest("base64url");
    expect(parseSignedRequest(`${sig}.${encoded}`, ["ig-secret"]).ok).toBe(true);
  });

  it("accepts either the Instagram or the Facebook app secret", () => {
    const signed = createSignedRequest(payload, "fb-secret");
    expect(parseSignedRequest(signed, ["ig-secret", "fb-secret"]).ok).toBe(true);
  });

  it("uses INSTAGRAM_APP_SECRET / FACEBOOK_APP_SECRET by default", () => {
    vi.stubEnv("INSTAGRAM_APP_SECRET", "ig-secret");
    vi.stubEnv("FACEBOOK_APP_SECRET", "");
    expect(parseSignedRequest(createSignedRequest(payload, "ig-secret")).ok).toBe(true);
  });

  it("rejects a wrong secret or a tampered payload", () => {
    const signed = createSignedRequest(payload, "other-secret");
    expect(parseSignedRequest(signed, ["ig-secret"])).toEqual({ ok: false, reason: "bad_signature" });

    const [sig] = createSignedRequest(payload, "ig-secret").split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, user_id: "victim" })).toString("base64url");
    expect(parseSignedRequest(`${sig}.${forged}`, ["ig-secret"])).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects algorithms other than HMAC-SHA256", () => {
    const signed = createSignedRequest({ ...payload, algorithm: "none" }, "ig-secret");
    expect(parseSignedRequest(signed, ["ig-secret"])).toEqual({ ok: false, reason: "unsupported_algorithm" });
  });

  it("rejects malformed input and a missing user id", () => {
    for (const value of [null, "", "abc", "a.b.c", ".x", "x.", "sig.%%%"]) {
      expect(parseSignedRequest(value, ["ig-secret"]).ok, String(value)).toBe(false);
    }
    const noUser = createSignedRequest({ algorithm: "HMAC-SHA256" }, "ig-secret");
    expect(parseSignedRequest(noUser, ["ig-secret"])).toEqual({ ok: false, reason: "missing_user" });
  });

  it("normalizes a numeric user id to a string", () => {
    const signed = createSignedRequest({ ...payload, user_id: 12345 }, "ig-secret");
    const result = parseSignedRequest(signed, ["ig-secret"]);
    expect(result.ok && result.payload.user_id).toBe("12345");
  });

  it("refuses to verify without any app secret configured", () => {
    expect(() => parseSignedRequest(createSignedRequest(payload, "x"), [])).toThrow(/required/);
  });

  it("reads signed_request from form-encoded and JSON bodies", async () => {
    const form = new Request("https://x.test", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "signed_request=abc.def",
    });
    expect(await readSignedRequestFromBody(form)).toBe("abc.def");
    const json = new Request("https://x.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signed_request: "abc.def" }),
    });
    expect(await readSignedRequestFromBody(json)).toBe("abc.def");
  });
});

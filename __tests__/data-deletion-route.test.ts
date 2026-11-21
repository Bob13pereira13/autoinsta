import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const handle = vi.hoisted(() => vi.fn());
const revoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/privacy/data-deletion", () => ({
  handleMetaDataDeletion: handle,
  revokeInstagramAccess: revoke,
}));

import { POST as dataDeletion } from "@/app/api/webhooks/meta/data-deletion/route";
import { POST as deauthorize } from "@/app/api/webhooks/meta/deauthorize/route";
import { createSignedRequest } from "@/lib/meta/signed-request";

function formRequest(path: string, signedRequest: string) {
  return new NextRequest(`https://app.example.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ signed_request: signedRequest }).toString(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INSTAGRAM_APP_SECRET", "ig-secret");
  vi.stubEnv("FACEBOOK_APP_SECRET", "");
});
afterEach(() => vi.unstubAllEnvs());

const valid = () =>
  createSignedRequest({ algorithm: "HMAC-SHA256", user_id: "178414", issued_at: 1 }, "ig-secret");

describe("POST /api/webhooks/meta/data-deletion", () => {
  it("returns Meta's required { url, confirmation_code } JSON", async () => {
    handle.mockResolvedValue({
      url: "https://app.example.com/exclusao-dados?codigo=ABCDEF0123456789",
      confirmation_code: "ABCDEF0123456789",
    });
    const res = await dataDeletion(formRequest("/api/webhooks/meta/data-deletion", valid()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://app.example.com/exclusao-dados?codigo=ABCDEF0123456789",
      confirmation_code: "ABCDEF0123456789",
    });
    expect(handle).toHaveBeenCalledWith("178414");
  });

  it("rejects an invalid signature without deleting anything", async () => {
    const forged = createSignedRequest({ algorithm: "HMAC-SHA256", user_id: "178414" }, "attacker");
    const res = await dataDeletion(formRequest("/api/webhooks/meta/data-deletion", forged));
    expect(res.status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });

  it("rejects a request with no signed_request", async () => {
    const res = await dataDeletion(formRequest("/api/webhooks/meta/data-deletion", ""));
    expect(res.status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/meta/deauthorize", () => {
  it("revokes access for a valid request", async () => {
    revoke.mockResolvedValue(1);
    const res = await deauthorize(formRequest("/api/webhooks/meta/deauthorize", valid()));
    expect(res.status).toBe(200);
    expect(revoke).toHaveBeenCalledWith("178414");
  });

  it("ignores a forged request", async () => {
    const forged = createSignedRequest({ algorithm: "HMAC-SHA256", user_id: "178414" }, "attacker");
    const res = await deauthorize(formRequest("/api/webhooks/meta/deauthorize", forged));
    expect(res.status).toBe(400);
    expect(revoke).not.toHaveBeenCalled();
  });
});

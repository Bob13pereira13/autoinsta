import { createHmac } from "crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createOAuthState,
  decryptToken,
  encryptToken,
  getAuthorizationUrl,
  verifyOAuthState,
} from "../lib/meta/oauth";

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret-with-enough-length");
  vi.stubEnv(
    "ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  );
});

describe("OAuth state and token encryption", () => {
  it("round-trips encrypted tokens", () => {
    const encrypted = encryptToken("long-lived-token");
    expect(encrypted).not.toBe("long-lived-token");
    expect(decryptToken(encrypted)).toBe("long-lived-token");
  });

  it("signs and verifies Instagram OAuth state", () => {
    const state = createOAuthState("workspace_123");
    expect(verifyOAuthState(state)?.workspaceId).toBe("workspace_123");
  });

  it("rejects tampered OAuth state", () => {
    const state = createOAuthState("workspace_123");
    expect(verifyOAuthState(`${state}tampered`)).toBeNull();
  });

  // Builds a state whose signature is valid but whose payload has an
  // unusual shape, so verifyOAuthState is exercised on its own validation
  // rather than on the signature check.
  const signedState = (payload: Record<string, unknown>) => {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", process.env.NEXTAUTH_SECRET!)
      .update(encoded)
      .digest("base64url");
    return `${encoded}.${signature}`;
  };

  it("rejects a state with no timestamp", () => {
    expect(verifyOAuthState(signedState({ workspaceId: "workspace_123" }))).toBeNull();
  });

  it("rejects a non-numeric timestamp", () => {
    expect(
      verifyOAuthState(
        signedState({ workspaceId: "workspace_123", ts: "not-a-number" })
      )
    ).toBeNull();
  });

  it("rejects a timestamp in the future", () => {
    expect(
      verifyOAuthState(
        signedState({
          workspaceId: "workspace_123",
          ts: Date.now() + 60 * 60 * 1000,
        })
      )
    ).toBeNull();
  });

  it("rejects an expired timestamp", () => {
    expect(
      verifyOAuthState(
        signedState({
          workspaceId: "workspace_123",
          ts: Date.now() - 11 * 60 * 1000,
        })
      )
    ).toBeNull();
  });

  it("rejects a state whose workspaceId is not a string", () => {
    expect(
      verifyOAuthState(
        signedState({ workspaceId: 123, ts: Date.now() })
      )
    ).toBeNull();
  });
});

describe("authorization URL (Business Login for Instagram)", () => {
  it("goes to Instagram's login with the three permissions, no Facebook option", () => {
    vi.stubEnv("INSTAGRAM_APP_ID", "123");
    const url = new URL(getAuthorizationUrl("https://app.test/api/instagram/callback", "signed-state"));
    expect(`${url.origin}${url.pathname}`).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/api/instagram/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")).toBe(
      "instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages"
    );
    expect(url.searchParams.get("enable_fb_login")).toBe("false");
  });

  it("ignores what the old Facebook (Unified) login used", () => {
    vi.stubEnv("INSTAGRAM_APP_ID", "123");
    vi.stubEnv("META_APP_ID", "789");
    vi.stubEnv("META_LOGIN_CONFIG_ID", "456");
    vi.stubEnv(
      "META_UNIFIED_LOGIN_URL",
      "https://www.facebook.com/v25.0/dialog/oauth?client_id=789&config_id=456&response_type=code"
    );
    const url = new URL(getAuthorizationUrl("https://app.test/cb", "s"));
    expect(url.origin).toBe("https://www.instagram.com");
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.has("config_id")).toBe(false);
    expect(url.toString()).not.toMatch(/facebook|business_management|pages_/);
  });
});

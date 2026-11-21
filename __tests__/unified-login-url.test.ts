import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMissingInstagramOAuthEnv, getUnifiedLoginUrlParts, isUnifiedLogin } from "@/lib/env";
import { getAuthorizationUrl } from "@/lib/meta/oauth";

const PASTED =
  "https://www.facebook.com/v25.0/dialog/oauth?client_id=111222333&config_id=987654321&redirect_uri=https%3A%2F%2Fold.example%2Fcb&response_type=token&state=abc&scope=pages_show_list&display=page&extras=%7B%22setup%22%3A%7B%7D%7D";

beforeEach(() => {
  vi.stubEnv("META_LOGIN_CONFIG_ID", "");
  vi.stubEnv("META_APP_ID", "");
  vi.stubEnv("META_UNIFIED_LOGIN_URL", "");
  vi.stubEnv("FACEBOOK_APP_SECRET", "fb-secret");
  vi.stubEnv("ENCRYPTION_KEY", "0".repeat(64));
  vi.stubEnv("NEXTAUTH_SECRET", "secret-secret-secret");
});
afterEach(() => vi.unstubAllEnvs());

describe("META_UNIFIED_LOGIN_URL", () => {
  it("turns on Unified login on its own", () => {
    expect(isUnifiedLogin()).toBe(false);
    vi.stubEnv("META_UNIFIED_LOGIN_URL", PASTED);
    expect(isUnifiedLogin()).toBe(true);
    expect(getMissingInstagramOAuthEnv()).toEqual([]);
  });

  it("keeps the pasted dialog, app, configuration and extra parameters, but owns callback, state and response type", () => {
    vi.stubEnv("META_UNIFIED_LOGIN_URL", PASTED);
    const url = new URL(getAuthorizationUrl("https://app.example.com/api/instagram/callback", "signed-state"));
    expect(`${url.origin}${url.pathname}`).toBe("https://www.facebook.com/v25.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("111222333");
    expect(url.searchParams.get("config_id")).toBe("987654321");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/api/instagram/callback");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("override_default_response_type")).toBe("true");
    expect(url.searchParams.get("display")).toBe("page");
    expect(url.searchParams.get("extras")).toBe('{"setup":{}}');
    // config_id replaces scope for system-user configurations.
    expect(url.searchParams.has("scope")).toBe(false);
  });

  it("lets META_APP_ID / META_LOGIN_CONFIG_ID override the pasted values", () => {
    vi.stubEnv("META_UNIFIED_LOGIN_URL", PASTED);
    vi.stubEnv("META_APP_ID", "555");
    vi.stubEnv("META_LOGIN_CONFIG_ID", "777");
    const url = new URL(getAuthorizationUrl("https://app.example.com/cb", "s"));
    expect(url.searchParams.get("client_id")).toBe("555");
    expect(url.searchParams.get("config_id")).toBe("777");
  });

  it("still works with only META_APP_ID + META_LOGIN_CONFIG_ID (upstream setup)", () => {
    vi.stubEnv("META_APP_ID", "555");
    vi.stubEnv("META_LOGIN_CONFIG_ID", "777");
    const url = new URL(getAuthorizationUrl("https://app.example.com/cb", "s"));
    expect(`${url.origin}${url.pathname}`).toBe("https://www.facebook.com/dialog/oauth");
    expect(url.searchParams.get("config_id")).toBe("777");
  });

  it("reports what is missing when the pasted URL lacks ids", () => {
    vi.stubEnv("META_UNIFIED_LOGIN_URL", "https://www.facebook.com/dialog/oauth?display=page");
    expect(getMissingInstagramOAuthEnv()).toEqual(["META_LOGIN_CONFIG_ID", "META_APP_ID"]);
  });

  it("rejects URLs that are not Meta login pages", () => {
    for (const bad of ["http://www.facebook.com/dialog/oauth", "https://evil.example/dialog/oauth?config_id=1", "https://facebook.com.evil.example/x", "not a url"]) {
      vi.stubEnv("META_UNIFIED_LOGIN_URL", bad);
      expect(() => getUnifiedLoginUrlParts(), bad).toThrow(/META_UNIFIED_LOGIN_URL/);
    }
  });
});

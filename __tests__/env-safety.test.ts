import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertNoPlaceholderSecrets,
  findPlaceholderSecrets,
  isPlaceholderValue,
  PlaceholderSecretError,
  SECURITY_SECRET_VARS,
  usableSecret,
} from "@/lib/env-safety";
import { createSignedRequest, parseSignedRequest } from "@/lib/meta/signed-request";
import { getAppSecrets, verifyWebhookSignature, verifyWebhookVerifyToken } from "@/lib/meta/webhook";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { getMissingInstagramOAuthEnv, requireSecret } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** KEY=VALUE pairs from .env.example, commented ones included. */
function exampleValues(): Record<string, string> {
  const text = readFileSync(path.join(__dirname, "..", ".env.example"), "utf8");
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^#?\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && match[2]) out[match[1]] = match[2];
  }
  return out;
}

describe("placeholder detection", () => {
  it("flags every security secret exactly as shipped in .env.example", () => {
    const values = exampleValues();
    for (const name of SECURITY_SECRET_VARS) {
      if (values[name] === undefined) continue;
      expect(isPlaceholderValue(values[name]), `${name}=${values[name]}`).toBe(true);
    }
    expect(findPlaceholderSecrets(values)).toEqual(
      expect.arrayContaining(["NEXTAUTH_SECRET", "CRON_SECRET", "ENCRYPTION_KEY", "FACEBOOK_APP_SECRET", "WEBHOOK_VERIFY_TOKEN", "INSTAGRAM_APP_SECRET"])
    );
  });

  it("flags upstream's example values and obvious non-secrets", () => {
    for (const value of ["your-facebook-app-secret", "replace-with-a-strong-random-secret", "re_...", "changeme", "CHANGE_ME", "[PREENCHER]", "0".repeat(64), "aaaaaaaaaaaa", "xxxxxxxx"]) {
      expect(isPlaceholderValue(value), value).toBe(true);
    }
  });

  it("accepts real-looking secrets", () => {
    for (const value of ["9f2c04a1b7d35e60aa11bb22cc33dd44", "Zr8kqP1vM3xYb7Tn2LwQe5Hs9Uc0Ad4F6gJ=", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdee", "secret-secret-secret"]) {
      expect(isPlaceholderValue(value), value).toBe(false);
    }
    expect(isPlaceholderValue("")).toBe(false);
    expect(isPlaceholderValue(undefined)).toBe(false);
    expect(usableSecret("your-meta-app-secret")).toBeUndefined();
    expect(usableSecret("9f2c04a1b7d35e60")).toBe("9f2c04a1b7d35e60");
  });
});

describe("startup check", () => {
  const good = {
    NEXTAUTH_SECRET: "Zr8kqP1vM3xYb7Tn2LwQe5Hs9Uc0Ad4F6gJ",
    ENCRYPTION_KEY: "9f2c04a1b7d35e60aa11bb22cc33dd449f2c04a1b7d35e60aa11bb22cc33dd44",
    FACEBOOK_APP_SECRET: "9f2c04a1b7d35e60aa11bb22cc33dd44",
  };

  it("passes with real secrets and unset optional ones", () => {
    expect(() => assertNoPlaceholderSecrets(good, { warn: () => {} })).not.toThrow();
  });

  it("refuses the public example values, naming each variable", () => {
    const env = { ...good, INSTAGRAM_APP_SECRET: "your-instagram-app-secret", CRON_SECRET: "replace-with-a-strong-random-secret" };
    try {
      assertNoPlaceholderSecrets(env, { warn: () => {} });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PlaceholderSecretError);
      expect((err as PlaceholderSecretError).variables).toEqual(["CRON_SECRET", "INSTAGRAM_APP_SECRET"]);
      expect((err as Error).message).toMatch(/Refusing to start/);
    }
  });

  it("only warns about non-secret example settings", () => {
    const warn = vi.fn();
    assertNoPlaceholderSecrets({ ...good, RESEND_API_KEY: "re_...", ADMIN_EMAILS: "voce@suaempresa.com.br" }, { warn });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("RESEND_API_KEY, ADMIN_EMAILS"));
  });

  it("is skipped during next build", () => {
    expect(() =>
      assertNoPlaceholderSecrets({ NEXT_PHASE: "phase-production-build", NEXTAUTH_SECRET: "replace-with-a-strong-random-secret" })
    ).not.toThrow();
  });

  it("exits the process in production and only warns in development", async () => {
    const { runStartupChecks } = await import("@/lib/startup-check");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NEXTAUTH_SECRET", "replace-with-a-strong-random-secret");

    vi.stubEnv("NODE_ENV", "development");
    runStartupChecks("web");
    expect(exit).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "production");
    runStartupChecks("web");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("verification points ignore placeholders", () => {
  it("never accepts a webhook or signed_request signed with an example secret", () => {
    vi.stubEnv("INSTAGRAM_APP_SECRET", "your-instagram-app-secret");
    vi.stubEnv("FACEBOOK_APP_SECRET", "9f2c04a1b7d35e60aa11bb22cc33dd44");
    expect(getAppSecrets()).toEqual(["9f2c04a1b7d35e60aa11bb22cc33dd44"]);

    const forged = createSignedRequest({ algorithm: "HMAC-SHA256", user_id: "victim" }, "your-instagram-app-secret");
    expect(parseSignedRequest(forged)).toEqual({ ok: false, reason: "bad_signature" });

    const body = '{"object":"instagram","entry":[]}';
    const sig = "sha256=" + createHmac("sha256", "your-instagram-app-secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig)).toBe(false);
  });

  it("fails closed when the only configured app secret is a placeholder", () => {
    vi.stubEnv("INSTAGRAM_APP_SECRET", "your-instagram-app-secret");
    vi.stubEnv("FACEBOOK_APP_SECRET", "your-meta-app-secret");
    expect(() => verifyWebhookSignature("{}", "sha256=00")).toThrow(/required/);
  });

  it("refuses example cron secrets and verify tokens", () => {
    vi.stubEnv("CRON_SECRET", "replace-with-a-strong-random-secret");
    vi.stubEnv("NEXTAUTH_SECRET", "replace-with-a-strong-random-secret");
    expect(isAuthorizedCronRequest("Bearer replace-with-a-strong-random-secret")).toBe(false);

    vi.stubEnv("WEBHOOK_VERIFY_TOKEN", "replace-with-a-webhook-verify-token");
    expect(verifyWebhookVerifyToken("replace-with-a-webhook-verify-token")).toBe(false);
  });

  it("refuses to sign OAuth state or exchange codes with example secrets", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "replace-with-a-strong-random-secret");
    expect(() => requireSecret("NEXTAUTH_SECRET")).toThrow(/example value/);
    vi.stubEnv("INSTAGRAM_APP_ID", "123");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "your-instagram-app-secret");
    vi.stubEnv("ENCRYPTION_KEY", "9f2c04a1b7d35e60aa11bb22cc33dd449f2c04a1b7d35e60aa11bb22cc33dd44");
    vi.stubEnv("NEXTAUTH_SECRET", "Zr8kqP1vM3xYb7Tn2LwQe5Hs9Uc0Ad4F6gJ");
    expect(getMissingInstagramOAuthEnv()).toEqual(["INSTAGRAM_APP_SECRET"]);
  });
});

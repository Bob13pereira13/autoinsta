import { z } from "zod";
import { isPlaceholderValue } from "@/lib/env-safety";

const HEX_32_BYTE = /^[a-f0-9]{64}$/i;

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

export function requireEnv(name: string): string {
  return readEnv(name);
}

/** Like requireEnv, but also refuses the public example values (lib/env-safety.ts). */
export function requireSecret(name: string): string {
  const value = readEnv(name);
  if (isPlaceholderValue(value)) {
    throw new Error(`${name} still has its example value from .env.example`);
  }
  return value;
}

export function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

export function getEncryptionKeyHex(): string {
  const value = readEnv("ENCRYPTION_KEY");
  if (!HEX_32_BYTE.test(value)) {
    throw new Error("ENCRYPTION_KEY must be a 32-byte hex string");
  }
  return value;
}

// Env vars that must be present before an Instagram OAuth round trip can even
// start. Checked up front so a self-hoster with a half-filled .env gets the
// variable names back instead of an unhandled throw from requireEnv().
const INSTAGRAM_OAUTH_ENV = [
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "ENCRYPTION_KEY",
  "NEXTAUTH_SECRET",
] as const;

// Unified login authenticates as the Meta app itself, not its Instagram app.
// META_APP_ID and META_LOGIN_CONFIG_ID can come from META_UNIFIED_LOGIN_URL.
const UNIFIED_OAUTH_ENV = [
  "META_LOGIN_CONFIG_ID",
  "META_APP_ID",
  "FACEBOOK_APP_SECRET",
  "ENCRYPTION_KEY",
  "NEXTAUTH_SECRET",
] as const;

export function getMissingInstagramOAuthEnv(): string[] {
  const required = isUnifiedLogin() ? UNIFIED_OAUTH_ENV : INSTAGRAM_OAUTH_ENV;
  const unifiedUrl = getUnifiedLoginUrlParts();
  return required.filter((name) => {
    if (name === "META_APP_ID" && getMetaAppId()) return false;
    if (name === "META_LOGIN_CONFIG_ID" && unifiedUrl?.configId) return false;
    const value = process.env[name];
    if (!value) return true;
    // A public example secret is as good as none: report it before the user
    // round-trips through Meta (see lib/env-safety.ts).
    if (name.endsWith("_SECRET") && isPlaceholderValue(value)) return true;
    // A malformed key fails later inside encryptToken, after the user has
    // already round-tripped through Meta — catch the bad format here instead.
    return name === "ENCRYPTION_KEY" && !HEX_32_BYTE.test(value);
  });
}

export function getMetaGraphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION ?? "v25.0";
}

// Meta apps created from October 2026 only offer "API setup with Unified
// login" (issues #103, #104). Setting the login configuration's ID makes new
// connections go through Unified login, with META_APP_ID and
// FACEBOOK_APP_SECRET (App settings > Basic). It decides only how accounts
// connect: each account records the login that issued its token, so accounts
// already connected through Instagram Login keep working either way.
export function isUnifiedLogin(): boolean {
  return Boolean(process.env.META_LOGIN_CONFIG_ID || process.env.META_UNIFIED_LOGIN_URL);
}

export interface UnifiedLoginUrlParts {
  /** e.g. https://www.facebook.com/v25.0/dialog/oauth (no query). */
  dialogUrl: string;
  appId: string | null;
  configId: string | null;
  /** Every other query parameter of the pasted URL, kept as-is. */
  extraParams: [string, string][];
}

// Parameters this app always sets itself: the callback must be ours, state is
// the signed CSRF/workspace token, and the code flow is required.
const OWNED_LOGIN_PARAMS = new Set(["redirect_uri", "state", "response_type", "client_id", "config_id", "scope"]);

/**
 * META_UNIFIED_LOGIN_URL: the login URL of the "API setup with Unified login"
 * configuration, pasted as-is from the Meta App Dashboard. Its client_id and
 * config_id are used (unless META_APP_ID / META_LOGIN_CONFIG_ID override
 * them); redirect_uri, state and response_type are always replaced. Only
 * facebook.com / instagram.com dialog URLs are accepted.
 */
export function getUnifiedLoginUrlParts(): UnifiedLoginUrlParts | null {
  const raw = process.env.META_UNIFIED_LOGIN_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("META_UNIFIED_LOGIN_URL is not a valid URL");
  }
  const host = url.hostname.toLowerCase();
  const allowedHost = ["facebook.com", "instagram.com"].some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
  if (url.protocol !== "https:" || !allowedHost) {
    throw new Error("META_UNIFIED_LOGIN_URL must be an https facebook.com or instagram.com login URL");
  }
  return {
    dialogUrl: `${url.origin}${url.pathname}`,
    appId: url.searchParams.get("client_id") || url.searchParams.get("app_id"),
    configId: url.searchParams.get("config_id"),
    extraParams: [...url.searchParams.entries()].filter(([key]) => !OWNED_LOGIN_PARAMS.has(key)),
  };
}

/** The Meta app id used by Unified login: META_APP_ID, else the pasted URL's client_id. */
export function getMetaAppId(): string | null {
  return process.env.META_APP_ID || getUnifiedLoginUrlParts()?.appId || null;
}

export function requireMetaAppId(): string {
  const appId = getMetaAppId();
  if (!appId) throw new Error("META_APP_ID environment variable is required");
  return appId;
}

export function requireMetaLoginConfigId(): string {
  const configId = process.env.META_LOGIN_CONFIG_ID || getUnifiedLoginUrlParts()?.configId;
  if (!configId) throw new Error("META_LOGIN_CONFIG_ID environment variable is required");
  return configId;
}

/**
 * Optional sign-in allowlist.
 *
 * A self-hosted instance on a public domain is open to signup: the email
 * provider creates an account for whoever asks for a magic link, and that
 * account gets its own workspace. ALLOWED_EMAILS closes it to a comma-separated
 * list of addresses. Left unset, sign-in behaves exactly as before, so an
 * existing deployment is unaffected.
 */
export function isEmailAllowedToSignIn(
  email: string | null | undefined
): boolean {
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length === 0) return true;
  if (!email) return false;
  return allowed.includes(email.toLowerCase());
}

export const serverEnvSchema = z.object({
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(16),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ENCRYPTION_KEY: z.string().regex(HEX_32_BYTE),
});

export function validateCoreEnv() {
  return serverEnvSchema.parse(process.env);
}

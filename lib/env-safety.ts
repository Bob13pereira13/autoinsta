/**
 * Refuses placeholder secrets — the example values from .env.example, which
 * are public in this repository.
 *
 * A placeholder that reaches production is not a harmless misconfiguration:
 * - NEXTAUTH_SECRET signs the session cookies and the OAuth state, so anyone
 *   could forge a session for any customer;
 * - INSTAGRAM_APP_SECRET / FACEBOOK_APP_SECRET verify webhooks and Meta's
 *   signed_request, so anyone could forge a data deletion request and erase a
 *   customer's data, or inject fake comments;
 * - CRON_SECRET guards the cron routes; ENCRYPTION_KEY protects stored tokens.
 *
 * Two layers: the web server and the worker refuse to start in production
 * (instrumentation.ts, worker/dm-worker.ts), and every place that verifies with
 * one of these secrets ignores a placeholder (usableSecret), in case startup
 * checks are bypassed — e.g. on serverless platforms.
 */

/** Variables whose placeholder value is a security hole. */
export const SECURITY_SECRET_VARS = [
  "NEXTAUTH_SECRET",
  "AUTH_SECRET",
  "CRON_SECRET",
  "ENCRYPTION_KEY",
  "FACEBOOK_APP_SECRET",
  "INSTAGRAM_APP_SECRET",
  "WEBHOOK_VERIFY_TOKEN",
] as const;

/** Variables whose placeholder only breaks a feature: logged, not fatal. */
const ADVISORY_VARS = [
  "RESEND_API_KEY",
  "INSTAGRAM_APP_ID",
  "META_APP_ID",
  "META_LOGIN_CONFIG_ID",
  "META_UNIFIED_LOGIN_URL",
  "ADMIN_EMAILS",
  "EMAIL_FROM",
] as const;

// Exact example values shipped in .env.example (this fork and upstream).
const KNOWN_PLACEHOLDERS = new Set(
  [
    "replace-with-a-strong-random-secret",
    "replace-with-a-webhook-verify-token",
    "your-instagram-app-id",
    "your-instagram-app-secret",
    "your-facebook-app-secret",
    "your-meta-app-secret",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "missing-resend-api-key",
    "voce@suaempresa.com.br",
  ].map((value) => value.toLowerCase())
);

const PLACEHOLDER_PATTERNS = [
  /^(replace[-_ ]?with|your[-_ ]|seu[-_ ]|sua[-_ ]|change[-_ ]?me|change[-_ ]?it|placeholder|example|preencher|todo\b|xxx)/i,
  /\[preencher\]/i,
  /\.\.\.$/, // "re_..."
  /SEU_APP_ID|SEU_CONFIG_ID/,
  /suaempresa\.com\.br/i,
];

export function isPlaceholderValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (KNOWN_PLACEHOLDERS.has(trimmed.toLowerCase())) return true;
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  // "0000…", "aaaa…": not a random secret.
  return trimmed.length >= 8 && /^(.)\1+$/.test(trimmed);
}

/** The value, unless it is empty or a placeholder. */
export function usableSecret(value: string | null | undefined): string | undefined {
  return value && !isPlaceholderValue(value) ? value : undefined;
}

type Env = Record<string, string | undefined>;

/** Security-relevant variables that are set to a placeholder. */
export function findPlaceholderSecrets(env: Env = process.env): string[] {
  return SECURITY_SECRET_VARS.filter((name) => isPlaceholderValue(env[name]));
}

export function findPlaceholderSettings(env: Env = process.env): string[] {
  return ADVISORY_VARS.filter((name) => isPlaceholderValue(env[name]));
}

export class PlaceholderSecretError extends Error {
  constructor(public readonly variables: string[]) {
    super(
      `Refusing to start: ${variables.join(", ")} still ${
        variables.length === 1 ? "has its" : "have their"
      } example value from .env.example. Generate real values ` +
        "(openssl rand -base64 32 for secrets, openssl rand -hex 32 for ENCRYPTION_KEY) " +
        "or remove the variable if you do not use it."
    );
    this.name = "PlaceholderSecretError";
  }
}

/**
 * Startup check. Throws PlaceholderSecretError for placeholder secrets and
 * logs a warning for placeholder non-secret settings. Skipped during
 * `next build`, which runs without the runtime environment.
 */
export function assertNoPlaceholderSecrets(env: Env = process.env, log: Pick<Console, "warn"> = console): void {
  if (env.NEXT_PHASE === "phase-production-build") return;

  const advisory = findPlaceholderSettings(env);
  if (advisory.length) {
    log.warn(`[env] Still using example values (features may not work): ${advisory.join(", ")}`);
  }

  const fatal = findPlaceholderSecrets(env);
  if (fatal.length) throw new PlaceholderSecretError(fatal);
}

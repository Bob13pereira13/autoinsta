import { prisma } from "@/lib/db/client";
import { isEmailAllowedToSignIn } from "@/lib/env";
import { getDummyPasswordHash, verifyPassword } from "@/lib/account/password";
import {
  clearLoginFailures,
  getClientIp,
  isLoginBlocked,
  recordLoginFailure,
} from "@/lib/account/login-rate-limit";
import { normalizeEmail } from "@/lib/account/tokens";
import { getWorkspaceMembership } from "@/lib/workspace";

export class LoginRateLimitedError extends Error {
  constructor() {
    super("Too many failed sign-in attempts");
    this.name = "LoginRateLimitedError";
  }
}

/** Right password, but the sign-up e-mail was never confirmed. */
export class EmailNotVerifiedError extends Error {
  constructor() {
    super("E-mail not confirmed");
    this.name = "EmailNotVerifiedError";
  }
}

/** Right password, but the client (workspace) is DISABLED. */
export class AccountDisabledError extends Error {
  constructor() {
    super("Account disabled");
    this.name = "AccountDisabledError";
  }
}

/**
 * E-mail + password check behind the Auth.js Credentials provider.
 * Returns the user on success, null on bad credentials, and throws
 * LoginRateLimitedError while the e-mail or IP is throttled.
 */
export async function authorizeWithPassword(
  credentials: Partial<Record<string, unknown>> | undefined,
  request?: Request
): Promise<{ id: string; email: string | null; name: string | null } | null> {
  const email = typeof credentials?.email === "string" ? normalizeEmail(credentials.email) : "";
  const password = typeof credentials?.password === "string" ? credentials.password : "";
  if (!email || !password) return null;

  const ip = request ? getClientIp(request.headers) : null;
  if (await isLoginBlocked(email, ip)) throw new LoginRateLimitedError();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, passwordHash: true, disabledAt: true, emailVerified: true },
  });
  // Always run one scrypt verification so timing does not reveal whether the
  // e-mail exists.
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyPasswordHash()));

  if (!user || !user.passwordHash || !valid || user.disabledAt || !isEmailAllowedToSignIn(email)) {
    await recordLoginFailure(email, ip);
    return null;
  }

  await clearLoginFailures(email);
  // Only told after the password matched, so these do not reveal anything to
  // someone guessing. Pending and rejected clients may sign in: they only see
  // a status screen (app/(dashboard)/layout.tsx).
  if (!user.emailVerified) throw new EmailNotVerifiedError();
  const membership = await getWorkspaceMembership(user.id);
  if (membership?.workspace.status === "DISABLED") throw new AccountDisabledError();
  return { id: user.id, email: user.email, name: user.name };
}

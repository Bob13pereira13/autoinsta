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

export class LoginRateLimitedError extends Error {
  constructor() {
    super("Too many failed sign-in attempts");
    this.name = "LoginRateLimitedError";
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
    select: { id: true, email: true, name: true, passwordHash: true, disabledAt: true },
  });
  // Always run one scrypt verification so timing does not reveal whether the
  // e-mail exists.
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyPasswordHash()));

  if (!user || !user.passwordHash || !valid || user.disabledAt || !isEmailAllowedToSignIn(email)) {
    await recordLoginFailure(email, ip);
    return null;
  }

  await clearLoginFailures(email);
  return { id: user.id, email: user.email, name: user.name };
}

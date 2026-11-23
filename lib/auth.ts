import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Nodemailer from "next-auth/providers/nodemailer";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { brand } from "@/config/brand";
import { usableSecret } from "@/lib/env-safety";
import { prisma } from "@/lib/db/client";
import { ensureWorkspaceForUser, resolveActiveWorkspaceId } from "@/lib/workspace";
import { canReceiveMagicLink, isClientDisabled, isSessionStillValid } from "@/lib/account/access";
import {
  AccountDisabledError,
  authorizeWithPassword,
  EmailNotVerifiedError,
  LoginRateLimitedError,
} from "@/lib/account/authorize";
import { getEmailFrom, sendEmail } from "@/lib/email/send";
import { adoptAccountLocale } from "@/lib/i18n/account-locale";
import { magicLinkEmail } from "@/lib/email/templates";

type AdapterPrismaClient = Parameters<typeof PrismaAdapter>[0];

// Setting EMAIL_SERVER switches magic links to your own SMTP server; Resend
// stays the default.
const smtpServer = process.env.EMAIL_SERVER;

/**
 * Provider id the magic-link form has to sign in with. It differs per
 * transport, so it is derived here rather than hardcoded at the call site.
 */
export const EMAIL_PROVIDER_ID = smtpServer ? "nodemailer" : "resend";
export const PASSWORD_PROVIDER_ID = "credentials";

/** Shown as ?code=rate_limited on the login page. */
class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}
/** ?code=email_not_verified: sign-up e-mail not confirmed yet. */
class EmailNotConfirmed extends CredentialsSignin {
  code = "email_not_verified";
}
/** ?code=account_disabled: the client was turned off in the admin area. */
class ClientDisabled extends CredentialsSignin {
  code = "account_disabled";
}

async function sendMagicLink({ identifier, url }: { identifier: string; url: string }) {
  await sendEmail({ kind: "magic_link", to: identifier, ...magicLinkEmail(url) });
}

export const authConfig = {
  adapter: PrismaAdapter(prisma as unknown as AdapterPrismaClient),
  providers: [
    Credentials({
      id: PASSWORD_PROVIDER_ID,
      name: "E-mail e senha",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials, request) {
        try {
          return await authorizeWithPassword(credentials, request);
        } catch (err) {
          if (err instanceof LoginRateLimitedError) throw new TooManyAttempts();
          if (err instanceof EmailNotVerifiedError) throw new EmailNotConfirmed();
          if (err instanceof AccountDisabledError) throw new ClientDisabled();
          throw err;
        }
      },
    }),
    smtpServer
      ? Nodemailer({ server: smtpServer, from: getEmailFrom(), sendVerificationRequest: sendMagicLink })
      : Resend({
          apiKey: process.env.RESEND_API_KEY ?? "missing-resend-api-key",
          from: getEmailFrom(),
          sendVerificationRequest: sendMagicLink,
        }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // The password provider already checked everything in authorize().
      if (account?.provider === PASSWORD_PROVIDER_ID) return true;
      // Magic link: runs before the e-mail is sent and again when the link is
      // opened. Closed sign-up — see lib/account/access.ts. An unknown address
      // gets the same "check your e-mail" page as a known one (no e-mail is
      // sent), so the form cannot be used to discover who has an account.
      if (await isClientDisabled(user?.email)) return "/login?code=account_disabled";
      return (await canReceiveMagicLink(user?.email)) ? true : "/verify-request";
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.authenticatedAt = Date.now();
        return token;
      }
      if (!token.sub) return null;
      // Re-checked on every request: a disabled user or a password change ends
      // existing sessions, which JWT sessions would otherwise keep alive.
      const current = await isSessionStillValid(
        token.sub,
        typeof token.authenticatedAt === "number" ? token.authenticatedAt : 0
      );
      if (!current) return null;
      token.email = current.email;
      token.name = current.name;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  events: {
    // Password and e-mail link alike: a browser without a language choice
    // takes the account's language (the review account is saved in English).
    async signIn({ user }) {
      if (user?.id) await adoptAccountLocale(user.id);
    },
    async createUser({ user }) {
      if (user.id) {
        await ensureWorkspaceForUser(user.id, user.email);
      }
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/verify-request",
    error: "/login",
  },
  // The password provider only works with JWT sessions in Auth.js v5. The
  // adapter is still used for users and magic-link verification tokens.
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  trustHost: true,
  // A placeholder is treated as unset, so Auth.js refuses to sign sessions
  // with a public key instead of silently accepting forged ones.
  secret: usableSecret(process.env.NEXTAUTH_SECRET),
  theme: { brandColor: brand.colors.primary },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function getCurrentWorkspaceId(): Promise<string | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  return resolveActiveWorkspaceId(userId);
}

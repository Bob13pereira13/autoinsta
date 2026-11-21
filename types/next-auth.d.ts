import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    /** When the user signed in (ms). Sessions older than a password change are rejected. */
    authenticatedAt?: number;
  }
}

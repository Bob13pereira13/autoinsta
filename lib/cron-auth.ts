import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { usableSecret } from "@/lib/env-safety";

/**
 * Shared guard for /api/cron/* routes.
 *
 * The routes accept `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends it
 * automatically), falling back to NEXTAUTH_SECRET like before. The previous
 * inline check compared against the template string `Bearer ${secret}`, which
 * with both variables unset became the literal "Bearer undefined" — anyone
 * sending that header ran the jobs. With no secret configured the routes now
 * refuse every request.
 */
export function isAuthorizedCronRequest(authorization: string | null): boolean {
  // Placeholders from .env.example are public and never accepted.
  const secret =
    usableSecret(process.env.CRON_SECRET) || usableSecret(process.env.NEXTAUTH_SECRET);
  if (!secret || !authorization) return false;

  // Hash both sides so the comparison is constant-time regardless of length.
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = createHash("sha256").update(authorization).digest();
  return timingSafeEqual(expected, received);
}

export function cronUnauthorized() {
  return NextResponse.json(
    { success: false, error: "Unauthorized" },
    { status: 401 }
  );
}

import { prisma } from "@/lib/db/client";

/**
 * Instagram account limit per client.
 *
 * Each workspace either follows the platform default (instagramAccountLimit
 * null) or has its own number. The default (PlatformSettings) is a number or
 * null = no limit. `effective` is what applies: null means unlimited.
 */
export const MAX_ACCOUNT_LIMIT = 100;

export interface AccountLimit {
  /** The client's own limit; null = follows the default. */
  own: number | null;
  /** The platform default; null = no limit. */
  platformDefault: number | null;
  /** What applies; null = no limit. */
  effective: number | null;
}

export function effectiveAccountLimit(own: number | null | undefined, platformDefault: number | null | undefined): number | null {
  return own ?? platformDefault ?? null;
}

export async function getDefaultAccountLimit(): Promise<number | null> {
  const settings = await prisma.platformSettings.findUnique({
    where: { id: "default" },
    select: { defaultInstagramAccountLimit: true },
  });
  return settings?.defaultInstagramAccountLimit ?? null;
}

export async function getWorkspaceAccountLimit(workspaceId: string): Promise<AccountLimit> {
  const [workspace, platformDefault] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { instagramAccountLimit: true } }),
    getDefaultAccountLimit(),
  ]);
  const own = workspace?.instagramAccountLimit ?? null;
  return { own, platformDefault, effective: effectiveAccountLimit(own, platformDefault) };
}

/** A limit value from input: null/"" = none (follow default / no limit), else an integer 1–100. */
export function parseLimitInput(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_ACCOUNT_LIMIT) return { ok: false };
  return { ok: true, value: n };
}

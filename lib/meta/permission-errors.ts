/**
 * The connection's essential calls (server only): when Meta refuses one for
 * lack of a permission, the login ends with that permission named
 * (instagram=missing_permissions&missing=…). Judged by the call's real result,
 * never by debug_token's `scopes`, which a system user token can leave
 * incomplete while the permission works.
 */
import { MetaApiError } from "@/lib/meta/client";
import type { MetaPermission } from "@/lib/meta/permissions";

/** Meta refused a call for lack of a permission: code 10 (permission denied) or 200–299. */
export function isPermissionDenied(error: unknown): boolean {
  return error instanceof MetaApiError && (error.code === 10 || (error.code >= 200 && error.code <= 299));
}

/** An essential call of the connection was refused for lack of `permission`. */
export class MissingPermissionError extends Error {
  constructor(
    public readonly permission: MetaPermission,
    public readonly metaError: MetaApiError
  ) {
    super(`Meta refused a call that needs ${permission}: ${metaError.message}`);
    this.name = "MissingPermissionError";
  }
}

/** Runs an essential call; Meta's permission error becomes the permission it needs. */
export async function requiring<T>(permission: MetaPermission, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (isPermissionDenied(error)) throw new MissingPermissionError(permission, error as MetaApiError);
    throw error;
  }
}

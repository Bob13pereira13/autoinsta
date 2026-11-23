/**
 * How the worker writes an error to a DM log (DmLog.errorMessage): the error
 * class, Meta's code and Meta's own text, e.g.
 * "PermissionError 10: (#10) ... [code=10 sub=2534022 type=... trace=...]".
 * Kept as is for support (the admin's diagnostics show it). The client never
 * sees it: lib/dm-logs/reasons.ts reads the code and shows a message of its own.
 */
import { MetaApiError } from "@/lib/meta/client";

export function formatErrorForLog(error: unknown): string {
  if (error instanceof MetaApiError) {
    return `${error.name} ${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

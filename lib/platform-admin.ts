/**
 * Platform operators (you, not your customers), from ADMIN_EMAILS — a
 * comma-separated, case-insensitive list.
 *
 * The upstream project is single-tenant, so some diagnostics are global: the
 * worker alert list in Redis and operational events without a workspace (e.g.
 * rejected webhook signatures, data deletion requests). With many customers on
 * one instance those must only be shown to the operator, never to every
 * workspace.
 */
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

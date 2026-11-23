/**
 * The Instagram permissions the app asks for, and what each one is for, in one
 * place: the screen shown before the login (app/(dashboard)/accounts/connect),
 * the Privacy Policy, the check of what was granted after the login
 * (app/api/instagram/callback) and GUIA_META_APP_REVIEW.md all read this.
 *
 * Instagram API with Instagram Login (Business Login for Instagram): the
 * person signs in with the Instagram account and turns the permissions on;
 * the scopes go in the authorization URL (lib/meta/scopes.ts). No Facebook
 * account, Page or business portfolio is involved.
 */
import { INSTAGRAM_REQUIRED_SCOPES } from "@/lib/meta/scopes";

export type MetaPermission = (typeof INSTAGRAM_REQUIRED_SCOPES)[number];

/** What the app does with each permission (English; translated in the catalog). */
export const PERMISSION_PURPOSE = {
  instagram_business_basic:
    "Read your Instagram account's name, username and profile picture, and list your posts and reels so you can choose where each automation runs.",
  instagram_business_manage_comments:
    "Receive the comments on your posts and reels to find your keywords, and post the public reply you set up.",
  instagram_business_manage_messages:
    "Send the automatic DM to people who commented a keyword, replied to your story or messaged you, and receive their messages and button taps.",
} as const satisfies Record<MetaPermission, string>;

/** The permissions the app asks for. */
export function requestedPermissions(): readonly MetaPermission[] {
  return INSTAGRAM_REQUIRED_SCOPES;
}

/**
 * The granted list as Meta's token exchange gives it, in today's names: the
 * old scope values (business_basic, business_manage_comments…) mean the same
 * instagram_business_* permission.
 */
export function normalizeGranted(granted: readonly string[]): string[] {
  return [...new Set(granted.map((p) => p.trim()).filter(Boolean).map((p) => (p.startsWith("business_") ? `instagram_${p}` : p)))];
}

/**
 * Requested permissions missing from what the login granted. An empty
 * `granted` list means Meta did not say (nothing is reported missing then).
 */
export function missingPermissions(granted: readonly string[], requested: readonly string[] = requestedPermissions()): string[] {
  if (granted.length === 0) return [];
  const have = new Set(granted);
  return requested.filter((permission) => !have.has(permission));
}

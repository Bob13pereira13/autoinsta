/**
 * The Meta permissions the app asks for, and what each one is for, in one
 * place: the screen shown before the login (app/(dashboard)/accounts/connect),
 * the Privacy Policy, the check of what was granted after the login
 * (app/api/instagram/callback) and GUIA_META_APP_REVIEW.md all read this.
 *
 * Instagram API with Facebook Login (Facebook Login for Business, the
 * configuration in META_LOGIN_CONFIG_ID): the permissions live in that login
 * configuration in the Meta App Dashboard, not in the URL; keep them equal to
 * FACEBOOK_LOGIN_PERMISSIONS. public_profile is granted by every Facebook
 * login; the app never reads the Facebook profile.
 *
 * Instagram API with Instagram Login (no META_LOGIN_CONFIG_ID): the scopes go
 * in the authorization URL (lib/meta/scopes.ts).
 *
 * What was granted is judged by the calls themselves (lib/meta/permission-errors.ts),
 * not by debug_token's `scopes`: with a system user token (Facebook Login for
 * Business) that list can leave out business_management while the permission works.
 */
import { isUnifiedLogin } from "@/lib/env";
import { INSTAGRAM_REQUIRED_SCOPES } from "@/lib/meta/scopes";

export const FACEBOOK_LOGIN_PERMISSIONS = [
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "business_management",
] as const;

export type MetaPermission =
  | (typeof FACEBOOK_LOGIN_PERMISSIONS)[number]
  | (typeof INSTAGRAM_REQUIRED_SCOPES)[number];

/** What the app does with each permission (English; translated in the catalog). */
export const PERMISSION_PURPOSE = {
  instagram_basic:
    "Read your Instagram account's name, username and profile picture, and list your posts and reels so you can choose where each automation runs.",
  instagram_business_basic:
    "Read your Instagram account's name, username and profile picture, and list your posts and reels so you can choose where each automation runs.",
  instagram_manage_comments:
    "Receive the comments on your posts and reels to find your keywords, and post the public reply you set up.",
  instagram_business_manage_comments:
    "Receive the comments on your posts and reels to find your keywords, and post the public reply you set up.",
  instagram_manage_messages:
    "Send the automatic DM to people who commented a keyword, replied to your story or messaged you, and receive their messages and button taps.",
  instagram_business_manage_messages:
    "Send the automatic DM to people who commented a keyword, replied to your story or messaged you, and receive their messages and button taps.",
  business_management:
    "Lets you choose, on Meta's login screen, the business and the Instagram account you connect to this app. Nothing in your business portfolio is read or changed.",
} as const satisfies Record<MetaPermission, string>;

/** The permissions the current login setup asks for. */
export function requestedPermissions(): readonly MetaPermission[] {
  return isUnifiedLogin() ? FACEBOOK_LOGIN_PERMISSIONS : INSTAGRAM_REQUIRED_SCOPES;
}

/**
 * Requested permissions not listed in what debug_token reports. Information
 * only (the admin's Diagnostics): nothing is blocked on it, since a system
 * user token can work with a permission its `scopes` leave out. An empty
 * `granted` list means Meta did not say (nothing is reported missing then).
 */
export function missingPermissions(granted: readonly string[], requested: readonly string[] = requestedPermissions()): string[] {
  if (granted.length === 0) return [];
  const have = new Set(granted);
  return requested.filter((permission) => !have.has(permission));
}

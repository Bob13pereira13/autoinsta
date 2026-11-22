/**
 * Instagram API with Instagram Login permissions requested at OAuth time.
 *
 * Only the three permissions this product needs are requested, and they are
 * exactly the ones justified in GUIA_META_APP_REVIEW.md. Requesting a scope you
 * do not demonstrate in the App Review screencast is a common rejection reason,
 * and once the app is Live a non-approved scope breaks login for every user.
 * The product reads no insights, so instagram_business_manage_insights is not
 * among them.
 */
export const INSTAGRAM_REQUIRED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
] as const;

export function getInstagramScopes(): string[] {
  return [...INSTAGRAM_REQUIRED_SCOPES];
}

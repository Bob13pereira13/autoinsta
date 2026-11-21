/**
 * Instagram API with Instagram Login permissions requested at OAuth time.
 *
 * Only the three permissions this product needs are requested, and they are
 * exactly the ones justified in GUIA_META_APP_REVIEW.md. Requesting a scope you
 * do not demonstrate in the App Review screencast is a common rejection reason,
 * and once the app is Live a non-approved scope breaks login for every user.
 */
export const INSTAGRAM_REQUIRED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
] as const;

export const INSTAGRAM_INSIGHTS_SCOPE = "instagram_business_manage_insights";

/**
 * Media insights (views, reach, saved, shares) and the follower history
 * backfill need `instagram_business_manage_insights`. They stay off unless you
 * set INSTAGRAM_INSIGHTS_ENABLED=true — do that only after Meta approved that
 * permission for your app, otherwise the OAuth login fails for every user who
 * is not an app tester.
 */
export function isInsightsEnabled(): boolean {
  return process.env.INSTAGRAM_INSIGHTS_ENABLED === "true";
}

export function getInstagramScopes(): string[] {
  return isInsightsEnabled()
    ? [...INSTAGRAM_REQUIRED_SCOPES, INSTAGRAM_INSIGHTS_SCOPE]
    : [...INSTAGRAM_REQUIRED_SCOPES];
}

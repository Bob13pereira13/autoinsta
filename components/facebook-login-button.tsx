"use client";

/**
 * The button that starts Meta's login, following the Facebook brand
 * guidelines: the official Facebook logo (white, unaltered) and the official
 * text "Continue with Facebook" on Facebook Blue (.btn-facebook in
 * globals.css). The text is Meta's, so it stays in English in the code and is
 * translated in the catalog like every other text ("Continuar com o
 * Facebook").
 *
 * With Instagram Login (no META_LOGIN_CONFIG_ID) the login is Instagram's, so
 * the button says "Continue with Instagram" without a logo.
 */
import { useI18n } from "@/lib/i18n/provider";

/** The Facebook logo (2023), as published in Meta's brand resources. */
const FACEBOOK_LOGO =
  "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z";

export function FacebookLoginButton({ href, facebook }: { href: string; facebook: boolean }) {
  const { t } = useI18n();
  if (!facebook) {
    return (
      <a href={href} className="btn btn-primary" data-meta-login>
        {t("Continue with Instagram")}
      </a>
    );
  }
  return (
    <a href={href} className="btn btn-facebook" data-meta-login>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d={FACEBOOK_LOGO} />
      </svg>
      {t("Continue with Facebook")}
    </a>
  );
}

"use client";

/**
 * The button that starts Instagram's login (Business Login for Instagram):
 * "Continue with Instagram" with the Instagram glyph (outline camera, one
 * colour, unaltered, as Instagram's brand guidelines allow).
 */
import { useI18n } from "@/lib/i18n/provider";

export function InstagramLoginButton({ href }: { href: string }) {
  const { t } = useI18n();
  return (
    <a href={href} className="btn btn-primary" data-meta-login>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
        <circle cx="12" cy="12" r="4.25" />
        <circle cx="17.4" cy="6.6" r="0.9" fill="currentColor" stroke="none" />
      </svg>
      {t("Continue with Instagram")}
    </a>
  );
}

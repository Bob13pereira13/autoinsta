/**
 * The public legal pages, one address per language. The Portuguese ones are
 * the originals; the English ones (also for the Meta App Dashboard and the
 * App Review) always show English, whatever the interface language.
 */
export const LEGAL_PATHS = {
  privacy: { "pt-BR": "/privacidade", en: "/privacy" },
  terms: { "pt-BR": "/termos", en: "/terms" },
  dataDeletion: { "pt-BR": "/exclusao-dados", en: "/data-deletion" },
} as const;

export type LegalPage = keyof typeof LEGAL_PATHS;
export type LegalLocale = "pt-BR" | "en";

export function legalPath(page: LegalPage, locale: string): string {
  return LEGAL_PATHS[page][locale === "en" ? "en" : "pt-BR"];
}

/**
 * The request header the proxy sets on a legal page with that page's language,
 * so the root layout writes it in <html lang> (an English page says "en" even
 * when the interface language is Portuguese, and the other way round).
 */
export const LEGAL_LOCALE_HEADER = "x-legal-locale";

/** The language of a legal page's address, or null for any other address. */
export function legalPageLocale(pathname: string): LegalLocale | null {
  for (const page of Object.values(LEGAL_PATHS)) {
    if (pathname === page.en) return "en";
    if (pathname === page["pt-BR"]) return "pt-BR";
  }
  return null;
}

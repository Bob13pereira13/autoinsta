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

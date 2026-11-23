import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import SiteFooter from "@/components/site-footer";
import DocumentLang from "@/components/legal/document-lang";
import { legalLastUpdatedLabel } from "@/config/brand";
import { createI18n } from "@/lib/i18n";
import { LEGAL_PATHS, type LegalLocale, type LegalPage } from "@/lib/legal/paths";

interface LegalShellProps {
  /** Which document, so the header can link to the same one in the other language. */
  page: LegalPage;
  locale: LegalLocale;
  title: string;
  description: string;
  children: React.ReactNode;
}

/**
 * Public wrapper of the legal pages: no sign-in needed. Each language has its
 * own address (lib/legal/paths.ts), and the header links to the other one.
 */
export default function LegalShell({ page, locale, title, description, children }: LegalShellProps) {
  const { t } = createI18n(locale);
  const other: LegalLocale = locale === "en" ? "pt-BR" : "en";
  return (
    <div lang={locale} className="min-h-screen text-foreground">
      <DocumentLang lang={locale} />
      <header className="border-b border-sidebar-border bg-sidebar backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-2">
          <BrandMark />
          <div className="flex items-center gap-2">
            <Link
              href={LEGAL_PATHS[page][other]}
              hrefLang={other}
              lang={other}
              className="btn btn-ghost btn-sm"
              data-legal-language
            >
              {other === "en" ? "English" : "Português"}
            </Link>
            <Link href="/login" className="btn btn-secondary btn-sm">
              {t("Sign in")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-14">
        <p className="inline-flex rounded-full border border-accent-soft-border bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-soft-fg">
          {t("Last updated: {date}", { date: legalLastUpdatedLabel(locale) })}
        </p>
        <h1 className="title-page mt-4 sm:!text-[40px]">{title}</h1>
        <p className="mt-5 text-base leading-8 text-muted">{description}</p>
        <div className="legal-content mt-10 space-y-8 text-sm leading-7 text-foreground">{children}</div>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}

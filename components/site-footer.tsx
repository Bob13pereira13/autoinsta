import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import { brand, filledBrandValue } from "@/config/brand";
import { createI18n, type Locale } from "@/lib/i18n";
import { legalPath } from "@/lib/legal/paths";

/** Public footer: legal links and the company identification from config/brand.ts, in the page's language. */
export default function SiteFooter({ locale }: { locale: Locale }) {
  const { t } = createI18n(locale);
  const company = filledBrandValue(brand.legal.companyName);
  const cnpj = filledBrandValue(brand.legal.cnpj);
  const supportEmail = filledBrandValue(brand.support.email);
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border-subtle">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-10 text-sm text-muted sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <BrandMark href={null} size="sm" className="mb-2" />
          {company && (
            <p>
              {company}
              {cnpj ? ` · CNPJ ${cnpj}` : ""}
            </p>
          )}
          {supportEmail && (
            <p>
              {t("Contact:")}{" "}
              <a className="underline underline-offset-4 hover:text-foreground" href={`mailto:${supportEmail}`}>
                {supportEmail}
              </a>
            </p>
          )}
          <p>{t("© {year} {company}. All rights reserved.", { year, company: company ?? brand.name })}</p>
        </div>
        <nav aria-label={t("Legal links")} className="flex flex-col gap-2 sm:items-end">
          <Link className="hover:text-foreground" href={legalPath("privacy", locale)}>
            {t("Privacy Policy")}
          </Link>
          <Link className="hover:text-foreground" href={legalPath("terms", locale)}>
            {t("Terms of Use")}
          </Link>
          <Link className="hover:text-foreground" href={legalPath("dataDeletion", locale)}>
            {t("Data deletion")}
          </Link>
        </nav>
      </div>
      <p className="mx-auto max-w-5xl px-5 pb-8 text-xs leading-5 text-faint">
        {t("Instagram and Facebook are trademarks of Meta Platforms, Inc. {brand} uses Meta's official API and is not affiliated with, sponsored or endorsed by Meta.")}
      </p>
    </footer>
  );
}

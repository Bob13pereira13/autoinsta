import type { Metadata } from "next";
import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import LanguageSwitcher from "@/components/language-switcher";
import SiteFooter from "@/components/site-footer";
import { brand, brandText, filledBrandValue } from "@/config/brand";
import { legalPath } from "@/lib/legal/paths";
import { I18nProvider } from "@/lib/i18n/provider";
import { getI18n } from "@/lib/i18n/server";
import { isSignupAvailable } from "@/lib/security/turnstile";
import type { StaticMessageKey } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  const text = brandText(locale);
  return { title: `${brand.name} - ${text.tagline}`, description: text.description };
}

const steps: { title: StaticMessageKey; body: StaticMessageKey }[] = [
  {
    title: "Connect your professional account",
    body: "You authorize access through Meta's official login. We never ask for your password.",
  },
  {
    title: "Create an automation",
    body: "Choose the post or reel, set the keywords (e.g. LINK) and write the message to send.",
  },
  {
    title: "Reply automatically",
    body: "When someone comments the keyword, we send the reply by DM and, if you want, a public reply on the comment.",
  },
];

const features: StaticMessageKey[] = [
  "DM replies to comments on posts and reels",
  "Automatic replies to direct messages and story replies",
  "Optional public reply on the comment",
  "Trackable links with click counts",
  "Send history with the reason for each skipped or failed message",
];

const trust: { title: StaticMessageKey; body: StaticMessageKey }[] = [
  {
    title: "Meta's official API",
    body: "Works only through Meta's official Instagram API. No bots, no scraping and no browser automation.",
  },
  {
    title: "Protected data",
    body: "Access tokens are encrypted (AES-256-GCM) and the signature of every notification from Meta is verified.",
  },
  {
    title: "You are in control",
    body: "Disconnect Instagram whenever you want, and its data is deleted. Deletion requests made through Instagram are processed automatically.",
  },
];

export default async function HomePage() {
  const { t, locale } = await getI18n();
  const text = brandText(locale);
  const company = filledBrandValue(brand.legal.companyName);
  const cnpj = filledBrandValue(brand.legal.cnpj);
  const address = filledBrandValue(brand.legal.address);
  const support = filledBrandValue(brand.support.email);
  return (
    <I18nProvider locale={locale}>
      <div className="min-h-screen text-foreground">
        <header className="sticky top-0 z-30 border-b border-sidebar-border bg-sidebar backdrop-blur-xl">
          <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-2">
            <BrandMark />
            <div className="flex flex-wrap items-center gap-3">
              <LanguageSwitcher />
              <Link href="/login" className="btn btn-primary">
                {t("Sign in")}
              </Link>
            </div>
          </div>
        </header>

        <main>
          <section className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
            <p className="inline-flex items-center gap-2 rounded-full border border-accent-soft-border bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-soft-fg">
              {t("Instagram automation")}
            </p>
            <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-[1.1] tracking-[-0.03em] text-heading sm:text-6xl">
              {text.tagline}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">{text.description}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              {isSignupAvailable() && (
                <Link href="/cadastro" className="btn btn-primary">
                  {t("Create account")}
                </Link>
              )}
              <Link href="/login" className={isSignupAvailable() ? "btn btn-secondary" : "btn btn-primary"}>
                {t("Sign in")}
              </Link>
              <a href="#how-it-works" className="btn btn-secondary">
                {t("How it works")}
              </a>
            </div>
          </section>

          <section id="how-it-works" className="border-t border-border-subtle">
            <div className="mx-auto max-w-5xl px-5 py-16">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-heading sm:text-3xl">{t("How it works")}</h2>
              <ol className="mt-8 grid gap-6 sm:grid-cols-3">
                {steps.map((step, index) => (
                  <li key={step.title} className="card card-interactive p-6">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-accent text-sm font-bold text-on-accent shadow-glow" aria-label={t("Step {number}", { number: index + 1 })}>{index + 1}</span>
                    <h3 className="mt-4 font-display text-lg font-semibold text-heading">{t(step.title)}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{t(step.body)}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="mx-auto max-w-5xl px-5 py-16">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-heading sm:text-3xl">{t("What you can do")}</h2>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {features.map((feature) => (
                <li key={feature} className="flex gap-3 text-sm leading-6">
                  <span aria-hidden="true" className="dot dot-accent mt-[7px]" />
                  <span>{t(feature)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="border-t border-border-subtle">
            <div className="mx-auto max-w-5xl px-5 py-16">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-heading sm:text-3xl">{t("Security and compliance")}</h2>
              <div className="mt-8 grid gap-6 sm:grid-cols-3">
                {trust.map((item) => (
                  <div key={item.title}>
                    <h3 className="font-display text-lg font-semibold text-heading">{t(item.title)}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{t(item.body)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="about" className="border-t border-border-subtle" data-company>
            <div className="mx-auto max-w-5xl px-5 py-16">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-heading sm:text-3xl">{t("Who we are")}</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
                {t("{brand} is a product of {company}, a Brazilian company.", { company: company ?? brand.name })}
              </p>
              <dl className="mt-6 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                {company && (
                  <>
                    <dt className="text-muted">{t("Company name")}</dt>
                    <dd>{company}</dd>
                  </>
                )}
                {cnpj && (
                  <>
                    <dt className="text-muted">CNPJ</dt>
                    <dd>{cnpj}</dd>
                  </>
                )}
                {address && (
                  <>
                    <dt className="text-muted">{t("Address")}</dt>
                    <dd>{address}</dd>
                  </>
                )}
                {support && (
                  <>
                    <dt className="text-muted">{t("Support")}</dt>
                    <dd>
                      <a className="link" href={`mailto:${support}`}>
                        {support}
                      </a>
                    </dd>
                  </>
                )}
              </dl>
              <p className="mt-6 text-sm text-muted">
                <Link className="link" href={legalPath("privacy", locale)}>
                  {t("Privacy Policy")}
                </Link>
                {" · "}
                <Link className="link" href={legalPath("terms", locale)}>
                  {t("Terms of Use")}
                </Link>
                {" · "}
                <Link className="link" href={legalPath("dataDeletion", locale)}>
                  {t("Data deletion")}
                </Link>
              </p>
            </div>
          </section>
        </main>

        <SiteFooter locale={locale} />
      </div>
    </I18nProvider>
  );
}

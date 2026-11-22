import BrandMark from "@/components/brand-mark";
import { ButtonLink } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";

/** 404 in the panel's look (Next's default page ignores the themes and fonts). */
export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <BrandMark size="lg" className="mb-8" />
        <div className="card p-8">
          <p className="font-display text-5xl font-semibold tracking-tight text-heading">404</p>
          <h1 className="title-section mt-3">{t("Page not found")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t("The address may be wrong or the page was removed.")}</p>
          <ButtonLink href="/dashboard" variant="primary" icon="arrowLeft" className="mt-6">
            {t("Back to the dashboard")}
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}

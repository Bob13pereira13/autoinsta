import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import SiteFooter from "@/components/site-footer";
import { legalLastUpdatedLabel } from "@/config/brand";

interface LegalShellProps {
  title: string;
  description: string;
  /** Defaults to brand.legal.lastUpdated. */
  updatedAt?: string;
  children: React.ReactNode;
}

/** Public page wrapper for /privacidade, /termos and /exclusao-dados. */
export default function LegalShell({
  title,
  description,
  updatedAt,
  children,
}: LegalShellProps) {
  return (
    <div className="min-h-screen text-foreground">
      <header className="border-b border-sidebar-border bg-sidebar backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <BrandMark />
          <Link
            href="/login"
            className="btn btn-secondary btn-sm"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-14">
        <p className="inline-flex rounded-full border border-accent-soft-border bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-soft-fg">
          Última atualização: {updatedAt ?? legalLastUpdatedLabel()}
        </p>
        <h1 className="title-page mt-4 sm:!text-[40px]">{title}</h1>
        <p className="mt-5 text-base leading-8 text-muted">{description}</p>
        <div className="legal-content mt-10 space-y-8 text-sm leading-7 text-foreground">
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

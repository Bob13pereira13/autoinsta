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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <BrandMark />
          <Link
            href="/login"
            className="text-sm font-semibold text-muted transition hover:text-foreground"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-14">
        <p className="text-sm font-semibold uppercase text-accent">
          Última atualização: {updatedAt ?? legalLastUpdatedLabel()}
        </p>
        <h1 className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">{title}</h1>
        <p className="mt-5 text-base leading-8 text-muted">{description}</p>
        <div className="legal-content mt-10 space-y-8 text-sm leading-7 text-foreground">
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

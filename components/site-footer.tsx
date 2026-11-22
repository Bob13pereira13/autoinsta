import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import { brand, PLACEHOLDER } from "@/config/brand";

function filled(value: string): string | null {
  return value && !value.includes(PLACEHOLDER) ? value : null;
}

/** Public footer: legal links and the company identification from config/brand.ts. */
export default function SiteFooter() {
  const company = filled(brand.legal.companyName);
  const cnpj = filled(brand.legal.cnpj);
  const supportEmail = filled(brand.support.email);
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
              Contato:{" "}
              <a className="underline underline-offset-4 hover:text-foreground" href={`mailto:${supportEmail}`}>
                {supportEmail}
              </a>
            </p>
          )}
          <p>© {year} {company ?? brand.name}. Todos os direitos reservados.</p>
        </div>
        <nav aria-label="Links legais" className="flex flex-col gap-2 sm:items-end">
          <Link className="hover:text-foreground" href="/privacidade">
            Política de Privacidade
          </Link>
          <Link className="hover:text-foreground" href="/termos">
            Termos de Uso
          </Link>
          <Link className="hover:text-foreground" href="/exclusao-dados">
            Exclusão de dados
          </Link>
        </nav>
      </div>
      <p className="mx-auto max-w-5xl px-5 pb-8 text-xs leading-5 text-faint">
        Instagram é uma marca registrada da Meta Platforms, Inc. {brand.name} usa a
        API oficial do Instagram e não é afiliado, patrocinado ou endossado pela Meta.
      </p>
    </footer>
  );
}

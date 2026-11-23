import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";
import { TermsContent } from "@/components/legal/terms-content";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `Termos de Uso - ${brand.name}`,
  description: `Condições para usar a ${brand.name}, automação de respostas no Instagram.`,
};

/** Public, no sign-in. Versão em português; the other language is linked in the header. */
export default function Page() {
  return (
    <LegalShell page="terms" locale="pt-BR" title="Termos de Uso" description={`Estes Termos regulam o uso da ${brand.name}, operada por ${brand.legal.companyName} (CNPJ ${brand.legal.cnpj}). Ao usar a plataforma, você concorda com eles.`}>
      <TermsContent locale="pt-BR" />
    </LegalShell>
  );
}

import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";
import { PrivacyContent } from "@/components/legal/privacy-content";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `Política de Privacidade - ${brand.name}`,
  description: `Como a ${brand.name} coleta, usa, guarda e apaga dados pessoais, incluindo os dados do Instagram obtidos pela API oficial da Meta.`,
};

/** Public, no sign-in. Versão em português; the other language is linked in the header. */
export default function Page() {
  return (
    <LegalShell page="privacy" locale="pt-BR" title="Política de Privacidade" description={`Esta política explica como a ${brand.name} trata dados pessoais ao automatizar respostas para contas profissionais do Instagram, conforme a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018) e os Termos da Plataforma da Meta.`}>
      <PrivacyContent locale="pt-BR" />
    </LegalShell>
  );
}

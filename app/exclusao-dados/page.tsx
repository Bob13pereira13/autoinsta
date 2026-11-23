import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";
import { DataDeletionContent } from "@/components/legal/data-deletion-content";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `Exclusão de dados - ${brand.name}`,
  description: `Como pedir a exclusão dos seus dados na ${brand.name} e acompanhar um pedido.`,
  robots: { index: true, follow: true },
};

/**
 * Public, no sign-in. The status link Meta shows after a deletion request
 * (?codigo=, from lib/privacy/data-deletion.ts) lands here; ?code= works too.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ codigo?: string; code?: string }> }) {
  const { codigo, code } = await searchParams;
  const value = (codigo ?? code)?.trim().toUpperCase().slice(0, 64);
  return (
    <LegalShell page="dataDeletion" locale="pt-BR" title="Exclusão de dados" description={`Saiba como apagar os dados que a ${brand.name} guarda sobre você e acompanhe um pedido de exclusão.`}>
      <DataDeletionContent locale="pt-BR" code={value} />
    </LegalShell>
  );
}

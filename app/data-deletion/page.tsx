import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";
import { DataDeletionContent } from "@/components/legal/data-deletion-content";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `Data deletion - ${brand.name}`,
  description: `How to request the deletion of your data at ${brand.name} and check a request.`,
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
    <LegalShell page="dataDeletion" locale="en" title="Data deletion" description={`How to delete the data ${brand.name} keeps about you, and how to check a deletion request.`}>
      <DataDeletionContent locale="en" code={value} />
    </LegalShell>
  );
}

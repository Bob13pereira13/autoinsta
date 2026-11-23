import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";
import { TermsContent } from "@/components/legal/terms-content";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `Terms of Use - ${brand.name}`,
  description: `Conditions for using ${brand.name}, automated Instagram replies.`,
};

/** Public, no sign-in. English version; the other language is linked in the header. */
export default function Page() {
  return (
    <LegalShell page="terms" locale="en" title="Terms of Use" description={`These Terms govern the use of ${brand.name}, operated by ${brand.legal.companyName} (CNPJ ${brand.legal.cnpj}). By using the platform you agree to them.`}>
      <TermsContent locale="en" />
    </LegalShell>
  );
}

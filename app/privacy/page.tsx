import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";
import { PrivacyContent } from "@/components/legal/privacy-content";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `Privacy Policy - ${brand.name}`,
  description: `How ${brand.name} collects, uses, stores and deletes personal data, including Instagram data obtained through Meta’s official API.`,
};

/** Public, no sign-in. English version; the other language is linked in the header. */
export default function Page() {
  return (
    <LegalShell page="privacy" locale="en" title="Privacy Policy" description={`This policy explains how ${brand.name} handles personal data when it automates replies for Instagram professional accounts, under the Brazilian General Data Protection Law (LGPD, Law 13,709/2018) and Meta’s Platform Terms.`}>
      <PrivacyContent locale="en" />
    </LegalShell>
  );
}

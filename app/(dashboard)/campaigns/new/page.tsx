import CampaignBuilder from "@/components/campaign-builder";
import { automationTypeFromSlug } from "@/lib/automation/type-slugs";

/** /campaigns/new?tipo=comentarios|stories|direct starts that kind of automation. */
export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { tipo } = await searchParams;
  const initialType = automationTypeFromSlug(Array.isArray(tipo) ? tipo[0] : tipo);
  return <CampaignBuilder key={initialType} mode="new" initialType={initialType} />;
}

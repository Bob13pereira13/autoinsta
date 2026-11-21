import AutomationsList from "@/components/automations-list";
import { automationTypeFromSlug } from "@/lib/automation/type-slugs";

/** /automations?tipo=comentarios|stories|direct opens that tab. */
export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { tipo } = await searchParams;
  const initialType = automationTypeFromSlug(Array.isArray(tipo) ? tipo[0] : tipo);
  // key: switching tabs through a link (sidebar, back button) remounts the list
  // on the right tab instead of keeping the previous one's state.
  return <AutomationsList key={initialType} initialType={initialType} />;
}

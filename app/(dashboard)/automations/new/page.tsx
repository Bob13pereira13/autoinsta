import { redirect } from "next/navigation";

export default async function NewAutomationRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { tipo } = await searchParams;
  const slug = Array.isArray(tipo) ? tipo[0] : tipo;
  redirect(slug ? `/campaigns/new?tipo=${encodeURIComponent(slug)}` : "/campaigns/new");
}

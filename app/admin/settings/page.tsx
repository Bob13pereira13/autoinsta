import PriceForm from "@/components/admin/price-form";
import { getPlatformPriceCents } from "@/lib/admin/clients";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const { t } = await getI18n();
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("Price")}</h1>
      <PriceForm cents={await getPlatformPriceCents()} />
    </div>
  );
}

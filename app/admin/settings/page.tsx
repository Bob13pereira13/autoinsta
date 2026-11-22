import DefaultLimitForm from "@/components/admin/default-limit-form";
import PriceForm from "@/components/admin/price-form";
import { getDefaultAccountLimit } from "@/lib/account-limit";
import { getPlatformPriceCents } from "@/lib/admin/clients";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const { t } = await getI18n();
  const [cents, limit] = await Promise.all([getPlatformPriceCents(), getDefaultAccountLimit()]);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("Price and limits")}</h1>
      <PriceForm cents={cents} />
      <DefaultLimitForm limit={limit} />
    </div>
  );
}

import NewClientForm from "@/components/admin/new-client-form";
import { getI18n } from "@/lib/i18n/server";

export default async function NewClientPage() {
  const { t } = await getI18n();
  return (
    <div className="space-y-4">
      <h1 className="title-page">{t("New client")}</h1>
      <NewClientForm />
    </div>
  );
}

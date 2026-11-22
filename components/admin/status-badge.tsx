import { getI18n } from "@/lib/i18n/server";

const TONE: Record<string, string> = {
  PENDING_APPROVAL: "bg-warning/10 text-warning",
  ACTIVE: "bg-success/10 text-success",
  DISABLED: "bg-zinc-500/10 text-muted",
  REJECTED: "bg-error/10 text-error",
};

export async function ClientStatusBadge({ status }: { status: string }) {
  const { t } = await getI18n();
  const label =
    status === "PENDING_APPROVAL" ? t("Awaiting approval") : status === "ACTIVE" ? t("Enabled") : status === "DISABLED" ? t("Disabled") : t("Rejected");
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${TONE[status] ?? ""}`}>{label}</span>;
}

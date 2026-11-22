import { getI18n } from "@/lib/i18n/server";
import { StatusDot, type StatusTone } from "@/components/ui/status";

const TONE: Record<string, StatusTone> = {
  PENDING_APPROVAL: "warning",
  ACTIVE: "success",
  DISABLED: "neutral",
  REJECTED: "error",
};

/** A client's status (Awaiting approval, Active, Disabled, Rejected) as a glowing dot + text. */
export async function ClientStatusBadge({ status }: { status: string }) {
  const { t } = await getI18n();
  const label =
    status === "PENDING_APPROVAL" ? t("Awaiting approval") : status === "ACTIVE" ? t("Enabled") : status === "DISABLED" ? t("Disabled") : t("Rejected");
  return <StatusDot tone={TONE[status] ?? "neutral"}>{label}</StatusDot>;
}

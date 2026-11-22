"use client";

import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { StatusDot, type StatusTone } from "@/components/ui/status";

/** Status of a DM send: a glowing dot and the text (color carries the state). */
const statusConfig: Record<string, { tone: StatusTone; label: StaticMessageKey }> = {
  SENT: { tone: "success", label: "Sent" },
  FAILED: { tone: "error", label: "Failed" },
  PENDING: { tone: "warning", label: "Pending" },
  SKIPPED_DEDUP: { tone: "neutral", label: "Dedup" },
  SKIPPED_RATE_LIMIT: { tone: "warning", label: "Rate limited" },
  SKIPPED_PLAN_LIMIT: { tone: "warning", label: "Skipped" },
  SKIPPED_NO_MATCH: { tone: "neutral", label: "No match" },
  SKIPPED_COOLDOWN: { tone: "neutral", label: "Already answered" },
  SKIPPED_HUMAN_ACTIVE: { tone: "neutral", label: "Team talking" },
};

export default function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const config = statusConfig[status] ?? statusConfig.PENDING;
  return (
    <StatusDot tone={config.tone} className="shrink-0 whitespace-nowrap">
      {t(config.label)}
    </StatusDot>
  );
}

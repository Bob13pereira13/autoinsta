"use client";

import { useI18n } from "@/lib/i18n/provider";
import { Sparkline } from "@/components/ui/sparkline";

/**
 * A number with its label (Space Grotesk). `daily`: real per-day values for a
 * small line; without them, only the number shows.
 */
interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  daily?: number[];
}

export default function StatCard({ label, value, trend, trendUp, daily }: StatCardProps) {
  const { t } = useI18n();
  return (
    <div className="card flex flex-col gap-1 p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="font-display text-[28px] font-semibold leading-tight text-heading">{value}</p>
        {daily && <Sparkline values={daily} width={72} height={28} />}
      </div>
      {trend && (
        <p className={`text-xs ${trendUp ? "text-success" : "text-error"}`}>
          {trendUp ? t("Up") : t("Down")} {trend}
        </p>
      )}
    </div>
  );
}

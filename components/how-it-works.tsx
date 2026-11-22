"use client";

import { useI18n } from "@/lib/i18n/provider";
import { Icon } from "@/components/ui/icons";

/** "How it works": the automation in one plain sentence, on a soft accent card. */
export default function HowItWorks({ summary, live }: { summary: string; live?: boolean }) {
  const { t } = useI18n();
  return (
    <section
      aria-live={live ? "polite" : undefined}
      aria-label={t("How it works")}
      className="flex items-start gap-3.5 rounded-card border border-accent-soft-border bg-summary px-[18px] py-4"
    >
      <span aria-hidden="true" className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-item bg-accent-soft text-accent-soft-icon">
        <Icon name="automations" size={18} strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-[0.04em] text-accent-fg">{t("How it works")}</span>
        <span className="text-base leading-relaxed text-heading">{summary}</span>
      </div>
    </section>
  );
}

import type { ReactNode } from "react";
import { cx } from "./cx";

export type StatusTone = "success" | "warning" | "error" | "neutral" | "accent";

const TEXT: Record<StatusTone, string> = {
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  neutral: "text-faint",
  accent: "text-accent-fg",
};

/** A 7px dot glowing in its own color, followed by the status text. */
export function StatusDot({ tone, children, className }: { tone: StatusTone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[13px] font-medium", TEXT[tone], className)}>
      <span aria-hidden="true" className={cx("dot", `dot-${tone}`)} />
      {children}
    </span>
  );
}

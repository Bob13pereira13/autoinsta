import type { ReactNode } from "react";
import { cx } from "./cx";

/** Keyword chip (monospace). With onRemove, it gets a remove button. */
export function KeywordChip({
  children,
  onRemove,
  removeLabel,
  size = "sm",
  className,
}: {
  children: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span className={cx("chip", size === "md" && "!rounded-chip !px-2.5 !py-1 !text-[13px]", className)}>
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="-mr-1 grid h-6 w-6 place-items-center rounded-md text-accent-soft-icon transition-colors hover:bg-accent-soft hover:text-accent-soft-fg"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </span>
  );
}

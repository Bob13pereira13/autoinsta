import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Top of a screen: optional breadcrumb or badge, the h1, a short description
 * and the actions (the primary one last).
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <div className="mb-3">{eyebrow}</div>}
        <h1 className="title-page">{title}</h1>
        {description && <div className="mt-2 leading-relaxed text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

/** Small pill above a title, e.g. "3 automations running now", with a glowing dot. */
export function Eyebrow({ children, dot = true }: { children: ReactNode; dot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-accent-soft-border bg-accent-soft px-2.5 py-1 text-xs text-accent-soft-fg">
      {dot && <span aria-hidden="true" className="dot dot-accent !h-1.5 !w-1.5" />}
      {children}
    </span>
  );
}

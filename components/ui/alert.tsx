import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./icons";

export type AlertTone = "error" | "warning" | "success" | "info";

const STYLE: Record<AlertTone, { box: string; icon: IconName }> = {
  error: { box: "border-error-border bg-error-soft text-error", icon: "alert" },
  warning: { box: "border-warning-border bg-warning-soft text-warning", icon: "alert" },
  success: { box: "border-success-border bg-success-soft text-success", icon: "check" },
  info: { box: "border-accent-soft-border bg-accent-soft text-accent-soft-fg", icon: "info" },
};

/**
 * A message box. Errors and warnings are announced (role="alert"); success
 * and info are polite (role="status"). Pass role={null} for static notes.
 */
export function Alert({
  tone,
  title,
  children,
  action,
  role,
  className,
  id,
}: {
  tone: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status" | null;
  className?: string;
  id?: string;
}) {
  const style = STYLE[tone];
  const ariaRole = role === null ? undefined : role ?? (tone === "error" || tone === "warning" ? "alert" : "status");
  return (
    <div id={id} role={ariaRole} className={cx("flex items-start gap-3 rounded-control border px-4 py-3 text-sm leading-relaxed", style.box, className)}>
      <Icon name={style.icon} size={18} strokeWidth={2} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

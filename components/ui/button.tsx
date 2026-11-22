import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./icons";

/**
 * Buttons. primary: brand gradient with a glow (one per screen, the main
 * action); secondary: outlined; ghost: text only; soft: tinted with the
 * accent; danger: destructive; danger-ghost: an icon that turns red on hover.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "soft" | "danger" | "danger-ghost";
export type ButtonSize = "md" | "sm" | "icon";

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", size === "icon" && "btn-icon", className);
}

function Content({ icon, children, loading }: { icon?: IconName; children?: ReactNode; loading?: boolean }) {
  return (
    <>
      {icon && <Icon name={icon} size={16} strokeWidth={2.2} className={loading ? "opacity-60" : undefined} />}
      {children}
    </>
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading,
  className,
  children,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; icon?: IconName; loading?: boolean }) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      aria-busy={loading || undefined}
      {...props}
      disabled={props.disabled || loading}
    >
      <Content icon={icon} loading={loading}>
        {children}
      </Content>
    </button>
  );
}

/** A link that looks like a button (navigation, not an action). */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; icon?: IconName }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      <Content icon={icon}>{children}</Content>
    </Link>
  );
}

/** Same as ButtonLink for plain <a> (external URLs, file downloads, OAuth). */
export function ButtonAnchor({
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  ...props
}: ComponentProps<"a"> & { variant?: ButtonVariant; size?: ButtonSize; icon?: IconName }) {
  return (
    <a className={buttonClass(variant, size, className)} {...props}>
      <Content icon={icon}>{children}</Content>
    </a>
  );
}

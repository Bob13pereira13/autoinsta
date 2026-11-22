import Link from "next/link";
import { cx } from "./cx";
import { Icon, type IconName } from "./icons";

/** Side-menu link: stroke icon, accent tint and an inner ring when active. */
export function NavItem({
  href,
  icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: IconName;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex min-h-[42px] items-center gap-2.5 rounded-item px-3 font-medium transition-colors duration-150",
        active
          ? "bg-nav-active text-heading shadow-[inset_0_0_0_1px_var(--nav-active-ring)]"
          : "text-muted hover:bg-nav-hover hover:text-heading"
      )}
    >
      <Icon name={icon} size={18} />
      <span>{label}</span>
    </Link>
  );
}

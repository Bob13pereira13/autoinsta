"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";

/** Admin area menu; the current section is tinted (exact match for the overview). */
export default function AdminNav({ items, label }: { items: { href: string; label: string }[]; label: string }) {
  const pathname = usePathname();
  const activeHref = items
    .filter((item) => (item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(item.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto px-1">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-h-10 shrink-0 items-center rounded-item px-3 text-sm font-medium transition-colors duration-150",
              active ? "bg-nav-active text-heading shadow-[inset_0_0_0_1px_var(--nav-active-ring)]" : "text-muted hover:bg-nav-hover hover:text-heading"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import { useTransition } from "react";
import { setTheme } from "@/lib/theme/actions";
import { useI18n } from "@/lib/i18n/provider";
import { cx } from "./cx";
import { Icon } from "./icons";

function currentTheme(): "light" | "dark" {
  const saved = document.documentElement.dataset.theme;
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * "Light theme" / "Dark theme". The label for the current theme is picked by
 * CSS (.show-in-dark / .show-in-light), so it is right on the first paint even
 * while following the system. The switch applies at once; the cookie keeps it.
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const next = currentTheme() === "dark" ? "light" : "dark";
        const before = document.documentElement.dataset.theme;
        document.documentElement.dataset.theme = next;
        startTransition(async () => {
          try {
            await setTheme(next);
          } catch {
            if (before) document.documentElement.dataset.theme = before;
            else delete document.documentElement.dataset.theme;
          }
        });
      }}
      className={cx(
        "flex min-h-[42px] items-center gap-2.5 rounded-item px-3 text-muted transition-colors duration-150 hover:bg-nav-hover hover:text-heading disabled:opacity-70",
        className
      )}
    >
      <span className="show-in-dark">
        <Icon name="sun" size={18} />
        {t("Light theme")}
      </span>
      <span className="show-in-light">
        <Icon name="moon" size={18} />
        {t("Dark theme")}
      </span>
    </button>
  );
}

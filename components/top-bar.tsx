"use client";

/**
 * Phone header: the menu button and the brand (with the area's badge in the
 * admin area). Desktop has no top bar: each screen starts with its own title,
 * as in the design mockups.
 */

import BrandMark from "@/components/brand-mark";
import { AreaBadge } from "@/components/sidebar";
import { useI18n } from "@/lib/i18n/provider";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

export default function TopBar({
  onMenuClick,
  menuOpen,
  homeHref,
  badge,
}: {
  onMenuClick: () => void;
  menuOpen: boolean;
  homeHref: string;
  badge?: string;
}) {
  const { t } = useI18n();
  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 backdrop-blur-xl lg:hidden"
      // Installed to the home screen the app starts at the very top of the
      // display, so without this the header sits under the clock and battery.
      // The inset is 0 in a browser tab and on desktop.
      style={{ height: "calc(3.5rem + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)" }}
    >
      <button
        type="button"
        onClick={onMenuClick}
        aria-label={t("Menu")}
        aria-expanded={menuOpen}
        className={buttonClass("ghost", "icon")}
      >
        <Icon name="menu" size={20} />
      </button>
      <BrandMark href={homeHref} size="sm" />
      {badge && <AreaBadge>{badge}</AreaBadge>}
    </header>
  );
}

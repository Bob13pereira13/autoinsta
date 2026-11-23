import Link from "next/link";
import { brand } from "@/config/brand";
import { cx } from "@/components/ui/cx";

/** Logo height per size; the width follows the logo's proportions. */
const HEIGHT = { sm: 26, md: 30, lg: 40 } as const;

/**
 * The logo (symbol + name) from config/brand.ts, linking home by default. Two
 * files, one per theme: the dark-coloured one on the light theme and the
 * light-coloured one on the dark theme. Which one shows is decided by CSS
 * (.show-in-light / .show-in-dark, the same rule as the theme button), so it
 * is right on the first paint, with the saved theme or the system's.
 */
export default function BrandMark({
  href = "/",
  size = "md",
  className = "",
}: {
  href?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const height = HEIGHT[size];
  const width = Math.round((brand.logo.width / brand.logo.height) * height);
  const content = (
    <>
      {(["light", "dark"] as const).map((theme) => (
        // A plain <img>: an SVG gains nothing from next/image. React preloads
        // both files (about 7 KB each, cached), so switching the theme never
        // leaves the logo blank.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={theme}
          src={brand.logo[theme]}
          alt=""
          width={width}
          height={height}
          decoding="async"
          data-logo={theme}
          className={cx(theme === "light" ? "show-in-light" : "show-in-dark", "max-w-none")}
          style={{ width, height }}
        />
      ))}
    </>
  );
  const classes = cx("inline-flex items-center", className);

  if (href === null) {
    return (
      <span role="img" aria-label={brand.logo.alt} className={classes}>
        {content}
      </span>
    );
  }
  return (
    <Link href={href} className={cx(classes, "rounded-item")} aria-label={brand.name}>
      {content}
    </Link>
  );
}

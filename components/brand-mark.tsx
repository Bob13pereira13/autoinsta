import Image from "next/image";
import Link from "next/link";
import { brand } from "@/config/brand";
import { cx } from "@/components/ui/cx";

/** Logo (with its glow) + brand name from config/brand.ts, linking home by default. */
export default function BrandMark({
  href = "/",
  size = "md",
  className = "",
}: {
  href?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = size === "lg" ? "h-10 w-10 rounded-[12px]" : size === "sm" ? "h-[30px] w-[30px] rounded-[9px]" : "h-8 w-8 rounded-[10px]";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";
  const content = (
    <>
      <Image src={brand.logo.src} alt="" width={brand.logo.width} height={brand.logo.height} className={cx(box, "shadow-glow")} />
      <span className={cx(text, "font-display font-bold tracking-tight text-heading")}>{brand.name}</span>
    </>
  );
  const classes = cx("inline-flex items-center gap-2.5", className);

  if (href === null) {
    return <span className={classes}>{content}</span>;
  }
  return (
    <Link href={href} className={cx(classes, "rounded-item")} aria-label={`${brand.name} — início`}>
      {content}
    </Link>
  );
}

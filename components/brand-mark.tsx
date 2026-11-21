import Image from "next/image";
import Link from "next/link";
import { brand } from "@/config/brand";

/** Logo + brand name from config/brand.ts, linking home by default. */
export default function BrandMark({
  href = "/",
  size = "md",
  className = "",
}: {
  href?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-lg";
  const content = (
    <>
      <Image
        src={brand.logo.src}
        alt=""
        width={brand.logo.width}
        height={brand.logo.height}
        className={box}
      />
      <span className={`${text} font-semibold text-foreground`}>{brand.name}</span>
    </>
  );
  const classes = `inline-flex items-center gap-2.5 ${className}`;

  if (href === null) {
    return <span className={classes}>{content}</span>;
  }
  return (
    <Link href={href} className={classes} aria-label={`${brand.name} — início`}>
      {content}
    </Link>
  );
}

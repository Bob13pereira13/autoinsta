import type { ComponentProps, ElementType } from "react";
import { cx } from "./cx";

/** The base container. `interactive` lifts 2px and glows on hover. */
export function Card<T extends ElementType = "div">({
  as,
  interactive,
  className,
  ...props
}: { as?: T; interactive?: boolean; className?: string } & Omit<ComponentProps<T>, "as" | "className">) {
  const Tag = (as ?? "div") as ElementType;
  return <Tag className={cx("card", interactive && "card-interactive", className)} {...props} />;
}

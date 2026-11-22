"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./icons";

export interface SegmentedItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: IconName;
  /** Small number after the label (e.g. how many items in the tab). */
  count?: number;
  disabled?: boolean;
  /** Tab panels: the id of the panel this tab controls. */
  controls?: string;
  id?: string;
}

/**
 * Segmented control: a subtle track whose active item carries the gradient.
 * `kind="tabs"` → role tablist/tab (aria-selected); `kind="radio"` →
 * radiogroup/radio (aria-checked). Arrow keys move between items and select
 * them; only the selected item is in the Tab order.
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  label,
  kind = "radio",
  size = "md",
  className,
}: {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  kind?: "tabs" | "radio";
  size?: "md" | "sm";
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = items.filter((i) => !i.disabled);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = enabled.findIndex((i) => i.value === items[index].value);
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % enabled.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + enabled.length) % enabled.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = enabled.length - 1;
    const target = enabled[next];
    onChange(target.value);
    refs.current[items.indexOf(target)]?.focus();
  }

  const selectedValue = items.some((i) => i.value === value && !i.disabled) ? value : enabled[0]?.value;
  return (
    <div role={kind === "tabs" ? "tablist" : "radiogroup"} aria-label={label} className={cx("seg", className)}>
      {items.map((item, index) => {
        const selected = item.value === selectedValue;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={item.id}
            type="button"
            role={kind === "tabs" ? "tab" : "radio"}
            aria-selected={kind === "tabs" ? selected : undefined}
            aria-checked={kind === "radio" ? selected : undefined}
            aria-controls={item.controls}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cx("seg-item", size === "sm" && "!min-h-9 !px-3 !text-[13px]", item.disabled && "cursor-not-allowed opacity-50")}
          >
            {item.icon && <Icon name={item.icon} size={16} strokeWidth={2} />}
            {item.label}
            {item.count !== undefined && <span className="text-xs opacity-80">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

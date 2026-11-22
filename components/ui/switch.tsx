"use client";

import { cx } from "./cx";

/**
 * On/off switch: a 42×24 track inside a 44px touch target. role="switch" with
 * aria-checked; the label is required (visible text elsewhere can be linked
 * with aria-labelledby instead).
 */
export function Switch({
  checked,
  onChange,
  label,
  labelledBy,
  describedBy,
  disabled,
  id,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "group grid h-11 w-12 shrink-0 cursor-pointer place-items-center rounded-item disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "flex h-6 w-[42px] items-center rounded-full p-[3px] transition-[background,box-shadow] duration-250",
          checked ? "bg-gradient-accent shadow-switch" : "bg-switch-off"
        )}
      >
        <span
          className={cx(
            "h-[18px] w-[18px] rounded-full bg-on-accent shadow-sm transition-transform duration-200",
            checked ? "translate-x-[18px]" : "translate-x-0"
          )}
        />
      </span>
    </button>
  );
}

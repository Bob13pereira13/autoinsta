"use client";

import { useId, type ReactNode } from "react";
import { cx } from "./cx";

/**
 * Choice cards: one option per card, with the mark on the left, a title and a
 * one-line explanation under it. The checked card gets the accent border and
 * the glow (`.choice` in globals.css).
 *
 * They are native inputs, so the keyboard works as people expect:
 * - RadioCards (pick ONE): a radiogroup of radios sharing a name — Tab reaches
 *   the checked one and the arrow keys move between options and check them.
 * - CheckCards (any number): checkboxes — Tab to each, Space toggles.
 * The input is labelled by the title and described by the explanation.
 */

export interface ChoiceOption<T extends string> {
  value: T;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

function ChoiceCard({
  type,
  name,
  value,
  checked,
  onChange,
  title,
  description,
  disabled,
}: {
  type: "radio" | "checkbox";
  name?: string;
  value: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="choice">
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        className="choice-mark"
      />
      <span className="min-w-0">
        <span id={`${id}-title`} className="choice-title">
          {title}
        </span>
        {description && (
          <span id={`${id}-desc`} className="choice-desc">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

export function RadioCards<T extends string>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  name,
  className,
}: {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group (or `labelledBy`, the id of a visible text). */
  label?: string;
  labelledBy?: string;
  name?: string;
  className?: string;
}) {
  const fallbackName = useId();
  const groupName = name ?? fallbackName;
  return (
    <div role="radiogroup" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} className={cx("grid gap-2", className)}>
      {options.map((option) => (
        <ChoiceCard
          key={option.value}
          type="radio"
          name={groupName}
          value={option.value}
          checked={option.value === value}
          onChange={(checked) => checked && onChange(option.value)}
          title={option.title}
          description={option.description}
          disabled={option.disabled}
        />
      ))}
    </div>
  );
}

export function CheckCards<T extends string>({
  options,
  values,
  onChange,
  label,
  labelledBy,
  className,
}: {
  options: ChoiceOption<T>[];
  values: readonly T[];
  /** Called with the option that changed and whether it is now checked. */
  onChange: (value: T, checked: boolean) => void;
  label?: string;
  labelledBy?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} className={cx("grid gap-2", className)}>
      {options.map((option) => (
        <ChoiceCard
          key={option.value}
          type="checkbox"
          value={option.value}
          checked={values.includes(option.value)}
          onChange={(checked) => onChange(option.value, checked)}
          title={option.title}
          description={option.description}
          disabled={option.disabled}
        />
      ))}
    </div>
  );
}

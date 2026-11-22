"use client";

/**
 * "Review" tag on an automation that breaks a rule its texts must follow now
 * (lib/automation/text-rules.ts). It keeps sending, but cannot be saved again
 * until fixed. The explanation opens on mouse hover, keyboard focus or a tap;
 * a second tap, a tap elsewhere or Esc closes it. The tap stops here (the row
 * behind it opens the automation), and screen readers get the explanation as
 * the tag's description.
 */

import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { Icon } from "@/components/ui/icons";

export function ReviewTag() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  // Touch has no hover, and iOS does not focus a tapped button: taps toggle.
  const pointer = useRef<string>("mouse");

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const text = t("This automation keeps sending, but needs a fix to be saved again.");
  return (
    <span
      ref={root}
      className="relative inline-flex"
      onClick={(e) => e.stopPropagation()}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setOpen(false);
      }}
    >
      <button
        type="button"
        data-note="review"
        aria-expanded={open}
        aria-describedby={id}
        onPointerDown={(e) => {
          pointer.current = e.pointerType;
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setOpen(true);
        }}
        onClick={() => setOpen((v) => (pointer.current === "mouse" ? true : !v))}
        onFocus={(e) => {
          // Keyboard focus only: a tap also focuses on some phones, and the
          // tap itself already toggles.
          if (e.currentTarget.matches(":focus-visible")) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning"
      >
        <Icon name="alert" size={13} strokeWidth={2} />
        {t("Review")}
      </button>
      {/* Always present for screen readers (the tag's description). */}
      <span id={id} className="sr-only">
        {text}
      </span>
      {open && (
        <span
          aria-hidden="true"
          data-tip="review"
          className="absolute left-0 top-full z-20 mt-1.5 w-60 max-w-[calc(100vw-48px)] rounded-control border border-warning-border bg-dialog px-3 py-2 text-xs leading-relaxed text-foreground shadow-[var(--dialog-shadow)]"
        >
          {text}
        </span>
      )}
    </span>
  );
}

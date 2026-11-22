"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "./cx";

/**
 * Modal dialog on the native <dialog>: focus moves inside and stays there,
 * Esc and a click on the backdrop close it, and focus returns to the control
 * that opened it. tone="danger" gets the red border and glow.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  tone = "default",
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "danger";
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="ui-dialog"
      data-size={size}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> itself.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div
          className={cx(
            "flex flex-col gap-3.5 rounded-[20px] border bg-dialog p-6",
            tone === "danger" ? "border-[color:var(--dialog-danger-border)] shadow-[var(--dialog-danger-shadow)]" : "border-border shadow-dialog"
          )}
        >
          <h2 id={titleId} className="text-xl font-semibold leading-snug">
            {title}
          </h2>
          {description && (
            <div id={descriptionId} className="text-sm leading-relaxed text-muted">
              {description}
            </div>
          )}
          {children}
          {footer && <div className="mt-1.5 flex flex-wrap justify-end gap-2.5">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

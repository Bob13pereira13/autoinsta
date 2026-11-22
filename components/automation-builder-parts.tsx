"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { storageState } from "@/lib/automation/editor-warnings";
import { useI18n } from "@/lib/i18n/provider";

export type AutomationKind = "COMMENTS" | "STORIES" | "DIRECT";
export type MediaSlot = "FOLLOW_PROMPT" | "MAIN" | "FOLLOW_UP";

export interface BuilderMedia {
  id: string;
  kind: "IMAGE" | "VIDEO";
  url: string;
  originalName?: string | null;
  /** Already saved on the automation (removing it takes effect on save). */
  attached: boolean;
}

/** A numbered step of the editor: a card with the step number in the gradient. */
export function Step({ number, title, aside, children }: { number: number; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card space-y-4 p-5" aria-labelledby={`step-${number}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-accent text-[13px] font-bold text-on-accent">
          {number}
        </span>
        <h2 id={`step-${number}`} className="title-section">
          {title}
        </h2>
        {aside && <span className="ml-auto text-[13px] text-faint">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------- storage -------------------------------- */

function formatMb(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0);
}

/** Disk usage of the workspace's uploads. Re-fetches when `version` changes. */
export function StorageUsage({ version }: { version: number }) {
  const { t } = useI18n();
  const [usage, setUsage] = useState<{ usedBytes: number; quotaBytes: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/media", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => !cancelled && d.success && setUsage(d.data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [version]);
  if (!usage) return null;
  const pct = Math.min(100, Math.round((usage.usedBytes / usage.quotaBytes) * 100));
  const state = storageState(usage.usedBytes, usage.quotaBytes);
  const full = state === "full";
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex justify-between text-xs text-faint">
        <span>{t("Media storage")}</span>
        <span className={full ? "font-semibold text-error" : ""}>
          {t("{used} MB of {quota} MB", { used: formatMb(usage.usedBytes), quota: formatMb(usage.quotaBytes) })}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-switch-off" role="progressbar" aria-label={t("Media storage")} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${full ? "bg-danger" : state === "near" ? "bg-warning-dot" : "bg-gradient-accent"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-faint">{t("The images and videos of every automation use this space.")}</p>
      {state === "near" && (
        <p data-note="storageNear" data-tone="warning" className="rounded-control border border-warning-border bg-warning-soft px-3 py-2 text-xs text-warning">
          {t("Media space almost full ({used} MB of {quota} MB). Remove media from automations you no longer use.", { used: formatMb(usage.usedBytes), quota: formatMb(usage.quotaBytes) })}
        </p>
      )}
      {full && (
        <p data-note="storageFull" data-tone="danger" className="rounded-control border border-error-border bg-error-soft px-3 py-2 text-xs text-error">
          {t("Your media storage is full. Remove media from automations you no longer use and try again.")}
        </p>
      )}
    </div>
  );
}

/* --------------------------------- media --------------------------------- */

const ACCEPT = "image/png,image/jpeg,video/mp4,video/quicktime,video/webm";
const MAX_IMAGES = 5;
const MAX_VIDEOS = 1;

/**
 * Images/videos for one message: upload, preview, remove. Validation is
 * repeated on the server; this only gives fast, friendly feedback.
 */
export function MediaPicker({
  items,
  onChange,
  onStorageChange,
  blockedReason,
}: {
  items: BuilderMedia[];
  onChange: (items: BuilderMedia[]) => void;
  onStorageChange: () => void;
  /** Shown instead of the upload button when media cannot be sent here. */
  blockedReason?: string | null;
}) {
  const { t, message } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const images = items.filter((m) => m.kind === "IMAGE").length;
  const videos = items.filter((m) => m.kind === "VIDEO").length;
  const full = images >= MAX_IMAGES && videos >= MAX_VIDEOS;

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      const isVideo = file.type.startsWith("video/");
      if (isVideo && videos >= MAX_VIDEOS) return setError(t("Up to 1 video per message"));
      if (!isVideo && images >= MAX_IMAGES) return setError(t("Up to 5 images per message"));
      if (!isVideo && file.size > 8 * 1024 * 1024) return setError(t("Images can be at most 8 MB."));
      if (isVideo && file.size > 25 * 1024 * 1024) return setError(t("Videos can be at most 25 MB."));
      setBusy(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/media", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!data.success) {
          setError(message(data.error, "Upload failed"));
          return;
        }
        onChange([...items, { id: data.data.id, kind: data.data.kind, url: data.data.url, originalName: data.data.originalName, attached: false }]);
        onStorageChange();
      } catch {
        setError(t("Upload failed"));
      } finally {
        setBusy(false);
      }
    },
    [images, videos, items, onChange, onStorageChange, message, t]
  );

  async function remove(item: BuilderMedia) {
    onChange(items.filter((m) => m.id !== item.id));
    // A fresh upload is deleted right away to free space; an attached file is
    // removed when the automation is saved.
    if (!item.attached) {
      await fetch(`/api/media/${item.id}`, { method: "DELETE" }).catch(() => {});
      onStorageChange();
    }
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t("Images and videos")}>
          {items.map((item) => (
            <li key={item.id} className="relative h-24 w-24 overflow-hidden rounded-control border border-border-subtle bg-surface">
              {item.kind === "VIDEO" ? (
                <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              ) : (
                <img src={item.url} alt={item.originalName ?? ""} className="h-full w-full object-cover" />
              )}
              {item.kind === "VIDEO" && (
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-scrim px-1.5 py-0.5 text-[11px] text-on-scrim">{t("Video")}</span>
              )}
              <button
                type="button"
                onClick={() => void remove(item)}
                aria-label={t("Remove {name}", { name: item.originalName ?? t("file") })}
                className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-item bg-scrim text-sm text-on-scrim transition-colors hover:bg-danger"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {blockedReason ? (
        <p className="rounded-control border border-warning-border bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">{blockedReason}</p>
      ) : (
        !full && (
          <>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              aria-label={t("Add image or video")}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control border-[1.5px] border-dashed border-accent-soft-border text-[13px] font-medium text-accent-fg transition-colors hover:border-accent-fg hover:bg-accent-soft disabled:opacity-60"
            >
              {busy ? t("Uploading…") : t("+ Add image or video")}
            </button>
            <p className="text-xs text-faint">{t("PNG or JPEG up to 8 MB (max 5) · MP4, MOV or WEBM up to 25 MB (max 1)")}</p>
          </>
        )
      )}
      {error && (
        <p role="alert" className="text-[13px] text-error">
          {error}
        </p>
      )}
    </div>
  );
}

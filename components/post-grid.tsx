"use client";

/**
 * Grid of the account's posts and reels for a Comments automation. Nothing
 * checked = the automation answers on every post; checking posts limits it to
 * those. Pages load as the grid scrolls (cursor pagination); "Refresh" starts
 * over to pick up new posts. Posts another active automation is marked on
 * carry a badge, since the two would share them (the priority rules decide).
 */

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

export interface SelectedPost {
  id: string;
  url?: string | null;
  publishedAt?: string | null;
  thumb?: string | null;
}

interface MediaItem {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
  permalink?: string;
}

const PAGE_SIZE = 24;

function thumbOf(item: MediaItem): string | null {
  if (item.media_type === "VIDEO") return item.thumbnail_url ?? null;
  return item.media_url ?? item.thumbnail_url ?? null;
}

function kindOf(item: MediaItem): "REEL" | "VIDEO" | "CAROUSEL" | "IMAGE" {
  if (item.media_product_type === "REELS") return "REEL";
  if (item.media_type === "VIDEO") return "VIDEO";
  if (item.media_type === "CAROUSEL_ALBUM") return "CAROUSEL";
  return "IMAGE";
}

function KindIcon({ kind }: { kind: ReturnType<typeof kindOf> }) {
  const { t } = useI18n();
  if (kind === "IMAGE") return null;
  const label = kind === "REEL" ? t("Reel") : kind === "VIDEO" ? t("Video") : t("Carousel");
  return (
    <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded bg-black/55 text-white" title={label}>
      <span className="sr-only">{label}</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {kind === "CAROUSEL" ? (
          <>
            <rect x="7" y="7" width="13" height="13" rx="2" />
            <path d="M4 16V5a1 1 0 0 1 1-1h11" />
          </>
        ) : kind === "REEL" ? (
          <>
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <path d="M3 8h18M8 3l3 5M14 3l3 5" />
            <path d="M10 12v5l4-2.5z" fill="currentColor" />
          </>
        ) : (
          <path d="M7 5v14l11-7z" fill="currentColor" />
        )}
      </svg>
    </span>
  );
}

export default function PostGrid({
  instagramAccountId,
  selected,
  onChange,
  usedBy,
  max,
}: {
  instagramAccountId: string | null;
  selected: SelectedPost[];
  onChange: (posts: SelectedPost[]) => void;
  /** postId → name of another active automation marked on it. */
  usedBy: Record<string, string>;
  max: number;
}) {
  const { t, message } = useI18n();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitNote, setLimitNote] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  // Guards against two pages being requested for the same cursor.
  const inFlight = useRef(false);
  const generation = useRef(0);

  const loadPage = useCallback(
    async (after: string | null, reset = false) => {
      if (inFlight.current && !reset) return;
      inFlight.current = true;
      const gen = reset ? ++generation.current : generation.current;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ paged: "1", limit: String(PAGE_SIZE) });
        if (instagramAccountId) params.set("instagramAccountId", instagramAccountId);
        if (after) params.set("after", after);
        const res = await fetch(`/api/instagram/posts?${params}`, { cache: "no-store" });
        const data = await res.json();
        if (gen !== generation.current) return;
        if (!data.success) {
          setError(message(data.error, "Failed to load posts"));
          return;
        }
        setItems((prev) => {
          const base = reset ? [] : prev;
          const seen = new Set(base.map((p) => p.id));
          return [...base, ...(data.data as MediaItem[]).filter((p) => !seen.has(p.id))];
        });
        setCursor(data.nextCursor ?? null);
        setDone(!data.nextCursor);
      } catch {
        if (gen === generation.current) setError(t("Failed to load posts"));
      } finally {
        if (gen === generation.current) {
          setLoading(false);
          inFlight.current = false;
        }
      }
    },
    [instagramAccountId, message, t]
  );

  const refresh = useCallback(() => {
    inFlight.current = false;
    setItems([]);
    setCursor(null);
    setDone(false);
    void loadPage(null, true);
  }, [loadPage]);

  // First page, and again when the account changes.
  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  // Infinite scroll: load the next page when the end of the grid shows up.
  useEffect(() => {
    const target = sentinel.current;
    if (!target || done) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && cursor && !inFlight.current) void loadPage(cursor);
      },
      { root: scroller.current, rootMargin: "200px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [cursor, done, loadPage]);

  const selectedIds = new Set(selected.map((p) => p.id));

  function toggle(item: MediaItem) {
    setLimitNote(false);
    if (selectedIds.has(item.id)) {
      onChange(selected.filter((p) => p.id !== item.id));
      return;
    }
    if (selected.length >= max) {
      setLimitNote(true);
      return;
    }
    onChange([...selected, { id: item.id, url: item.permalink ?? null, publishedAt: item.timestamp ?? null, thumb: thumbOf(item) }]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p aria-live="polite" className={selected.length ? "font-medium text-accent" : "text-muted"}>
          {selected.length
            ? t(selected.length === 1 ? "{count} post selected" : "{count} posts selected", { count: selected.length })
            : t("No post selected: the automation answers on all posts and reels.")}
        </p>
        <div className="flex items-center gap-3">
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="text-xs font-medium text-accent hover:underline">
              {t("Clear selection")}
            </button>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={loading && items.length === 0}
            className="rounded border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
          >
            {t("Refresh")}
          </button>
        </div>
      </div>
      {limitNote && (
        <p role="alert" className="text-xs text-warning">
          {t("Up to {max} posts per automation.", { max })}
        </p>
      )}

      <div ref={scroller} className="max-h-[30rem] overflow-y-auto rounded-lg border border-border p-2">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4" aria-label={t("Posts and reels")}>
          {items.map((item) => {
            const checked = selectedIds.has(item.id);
            const thumb = thumbOf(item);
            const used = usedBy[item.id];
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={(item.caption?.slice(0, 80) || t("Post from {date}", { date: new Date(item.timestamp).toLocaleDateString() }))}
                  onClick={() => toggle(item)}
                  className={`relative block aspect-square w-full overflow-hidden rounded-md border-2 bg-zinc-100 transition ${
                    checked ? "border-accent ring-2 ring-accent/40" : "border-transparent hover:border-border-hover"
                  }`}
                >
                  {thumb ? (
                    <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-xs text-muted">{t("No preview")}</span>
                  )}
                  <span
                    aria-hidden="true"
                    className={`absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded border-2 text-xs font-bold ${
                      checked ? "border-accent bg-accent text-white" : "border-white bg-black/30 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <KindIcon kind={kindOf(item)} />
                  {used && (
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1.5 py-1 text-left text-[10px] text-white">
                      {t("In use: {name}", { name: used })}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {loading &&
            Array.from({ length: items.length ? 4 : 8 }, (_, i) => (
              <li key={`skeleton-${i}`} aria-hidden="true" className="aspect-square animate-pulse rounded-md bg-zinc-100" />
            ))}
        </ul>
        {!loading && !error && items.length === 0 && done && (
          <p className="p-4 text-center text-sm text-muted">{t("This account has no posts yet.")}</p>
        )}
        {error && (
          <div className="p-4 text-center">
            <p className="text-sm text-error">{error}</p>
            <button type="button" onClick={() => (items.length ? void loadPage(cursor) : refresh())} className="mt-2 text-xs font-medium text-accent hover:underline">
              {t("Try again")}
            </button>
          </div>
        )}
        <div ref={sentinel} className="h-1" />
      </div>
    </div>
  );
}

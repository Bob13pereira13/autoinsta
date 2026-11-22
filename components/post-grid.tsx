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
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { cx } from "@/components/ui/cx";

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
  comments_count?: number;
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

/** Kind of post and its comment count, bottom left of the thumbnail. */
function KindBadge({ kind, comments }: { kind: ReturnType<typeof kindOf>; comments?: number }) {
  const { t } = useI18n();
  const label = kind === "REEL" ? t("Reel") : kind === "VIDEO" ? t("Video") : kind === "CAROUSEL" ? t("Carousel") : null;
  const icon = kind === "REEL" ? "reel" : kind === "VIDEO" ? "video" : kind === "CAROUSEL" ? "carousel" : "photo";
  return (
    <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-scrim px-1.5 py-0.5 text-[11px] font-semibold text-on-scrim">
      <Icon name={icon} size={13} strokeWidth={2.2} />
      {label && <span className="sr-only">{label}</span>}
      {typeof comments === "number" && (
        <>
          <Icon name="comments" size={12} strokeWidth={2.2} className="ml-1" />
          {comments}
        </>
      )}
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
        <p aria-live="polite" className={selected.length ? "font-semibold text-accent-fg" : "text-muted"}>
          {selected.length
            ? t(selected.length === 1 ? "{count} post selected" : "{count} posts selected", { count: selected.length })
            : t("No post selected: the automation answers on all posts and reels.")}
        </p>
        <div className="flex items-center gap-3">
          {selected.length > 0 && (
            <Button size="sm" onClick={() => onChange([])}>
              {t("Clear selection")}
            </Button>
          )}
          <Button size="sm" icon="refresh" onClick={refresh} disabled={loading && items.length === 0}>
            {t("Refresh")}
          </Button>
        </div>
      </div>
      {limitNote && (
        <p role="alert" className="text-[13px] text-warning">
          {t("Up to {max} posts per automation.", { max })}
        </p>
      )}

      <div ref={scroller} className="max-h-[32rem] overflow-y-auto rounded-control border border-border-subtle bg-surface p-2">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2" aria-label={t("Posts and reels")}>
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
                  className={cx(
                    "post-tile relative block aspect-[4/5] w-full overflow-hidden rounded-control border-2 bg-switch-off",
                    checked ? "border-accent-fg shadow-glow" : "border-transparent"
                  )}
                >
                  {thumb ? (
                    <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center px-2 text-center text-xs text-muted">{t("No preview")}</span>
                  )}
                  <span
                    aria-hidden="true"
                    className={cx(
                      "absolute right-2 top-2 grid h-[22px] w-[22px] place-items-center rounded-[7px] border-2 border-on-scrim text-on-scrim",
                      checked ? "bg-gradient-accent" : "bg-scrim"
                    )}
                  >
                    {checked && <Icon name="check" size={13} strokeWidth={3.2} />}
                  </span>
                  {used ? (
                    <span className="absolute inset-x-0 bottom-0 truncate bg-scrim px-2 py-1.5 text-left text-[11px] text-on-scrim">
                      {t("In use: {name}", { name: used })}
                    </span>
                  ) : (
                    <KindBadge kind={kindOf(item)} comments={item.comments_count} />
                  )}
                </button>
              </li>
            );
          })}
          {loading &&
            Array.from({ length: items.length ? 4 : 8 }, (_, i) => (
              <li key={`skeleton-${i}`} aria-hidden="true" className="aspect-[4/5] rounded-control bg-switch-off" />
            ))}
        </ul>
        {!loading && !error && items.length === 0 && done && (
          <p className="p-4 text-center text-sm text-muted">{t("This account has no posts yet.")}</p>
        )}
        {error && (
          <div className="p-4 text-center">
            <p className="text-sm text-error">{error}</p>
            <Button size="sm" className="mt-2" onClick={() => (items.length ? void loadPage(cursor) : refresh())}>
              {t("Try again")}
            </Button>
          </div>
        )}
        <div ref={sentinel} className="h-1" />
      </div>
    </div>
  );
}

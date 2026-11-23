"use client";

/**
 * Automations list, split into three tabs by channel — Comments, Stories and
 * Direct — each with a one-line explanation, an example and its own "New
 * automation" button. Cards keep the toggle, duplicate and delete actions.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import { readCache, writeCache } from "@/lib/client-cache";
import { automationTypeSlug } from "@/lib/automation/type-slugs";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonAnchor, ButtonLink, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Icon, type IconName } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatusDot, type StatusTone } from "@/components/ui/status";
import { accountNeedsReconnect } from "@/lib/automation/account-status";
import { byKind, findConflicts, type ConflictCandidate } from "@/lib/automation/conflicts";
import { channelOfType, overlapText, splitTag } from "@/lib/automation/conflict-text";
import { needsReview } from "@/lib/automation/text-rules";
import { ReviewTag } from "@/components/review-tag";
import { Switch } from "@/components/ui/switch";

type AutomationType = "COMMENTS" | "STORIES" | "DIRECT";
const TABS: AutomationType[] = ["COMMENTS", "STORIES", "DIRECT"];
const CHANNEL_ICON: Record<AutomationType, IconName> = { COMMENTS: "comments", STORIES: "stories", DIRECT: "direct" };

interface Campaign {
  id: string;
  name: string;
  goal: string | null;
  postId: string | null;
  postUrl: string | null;
  pendingNextReel: boolean;
  matchAnyPost: boolean;
  keywords: string[];
  matchAnyWord: boolean;
  type: AutomationType;
  triggerStoryReplies: boolean;
  triggerStoryMentions: boolean;
  media?: { id: string }[];
  dmMessage: string;
  openingDmEnabled: boolean;
  openingDmMessage: string | null;
  openingDmButtonLabel: string | null;
  publicReplyEnabled: boolean;
  publicReplyMessage: string | null;
  publicReplyMessages: string[];
  requireFollow: boolean;
  followPromptMessage: string | null;
  followPromptButtonLabel: string | null;
  linkButtonLabel?: string | null;
  followUpEnabled?: boolean;
  followUpMessage?: string | null;
  isActive: boolean;
  wholeWordMatch: boolean;
  instagramAccountId: string;
  instagramAccount: {
    username: string;
    instagramId: string;
    automationsEnabled?: boolean;
    tokenInvalidAt?: string | null;
    tokenExpiresAt?: string | null;
  };
  postIds?: string[];
  reportShareSlug: string | null;
  reportShareEnabled: boolean;
  reportUrl: string | null;
  createdAt: string;
  _count: { dmLogs: number };
  trackedLinks: Array<{
    id: string;
    slug: string;
    label: string | null;
    destinationUrl: string;
    trackedUrl: string;
    _count: { clicks: number };
  }>;
  analytics: {
    sent: number;
    skipped: number;
    failed: number;
    clicks: number;
    ctr: number;
    topKeywords: { keyword: string; count: number }[];
  };
}

export default function AutomationsList({ initialType }: { initialType: AutomationType }) {
  const i18n = useI18n();
  const { t, label } = i18n;
  const router = useRouter();
  const [activeType, setActiveType] = useState<AutomationType>(initialType);
  const [automations, setAutomations] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [loading, setLoading] = useState(true);
  // postId -> current thumbnail URL, fetched live (Instagram URLs expire, so
  // they are never stored on the campaign).
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  // postId -> video URL for reels, so a campaign thumbnail can play on click.
  const [videos, setVideos] = useState<Record<string, string>>({});
  // The reel currently playing in the lightbox (null when closed).
  const [playingVideo, setPlayingVideo] = useState<{
    url: string;
    postUrl: string | null;
  } | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">(
    "all"
  );

  const fetchAutomations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedAccountId !== "all") {
        params.set("instagramAccountId", selectedAccountId);
      }
      const res = await fetch(
        `/api/automations${params.size ? `?${params}` : ""}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (data.success) setAutomations(data.data);
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success) setAccounts(payload.data.instagramAccounts ?? []);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchAutomations();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchAutomations]);

  // Fetch fresh post thumbnails (and reel video URLs) for the accounts in view
  // and map them by postId. Cache-first so they show instantly on a return
  // visit. Instagram URLs expire, so they are never stored on the campaign.
  useEffect(() => {
    if (automations.length === 0) return;
    let cancelled = false;
    const accountIds = Array.from(
      new Set(automations.map((a) => a.instagramAccountId))
    ).sort();
    const cacheKey = `ig-media:${accountIds.join(",")}`;

    const cached = readCache<{
      thumbs: Record<string, string>;
      videos: Record<string, string>;
    }>(cacheKey, 15 * 60 * 1000);
    // Hydrating state from cache is a legitimate effect use here.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (cached.data) {
      setThumbnails(cached.data.thumbs);
      setVideos(cached.data.videos);
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    Promise.all(
      accountIds.map((accountId) =>
        fetch(`/api/instagram/posts?instagramAccountId=${accountId}&limit=50`)
          .then((res) => res.json())
          .then((payload) =>
            payload.success
              ? (payload.data as {
                  id: string;
                  media_type?: string;
                  media_url?: string;
                  thumbnail_url?: string;
                }[])
              : []
          )
          .catch(() => [])
      )
    ).then((lists) => {
      if (cancelled) return;
      const thumbs: Record<string, string> = {};
      const vids: Record<string, string> = {};
      for (const list of lists) {
        for (const media of list) {
          const url = media.thumbnail_url ?? media.media_url;
          if (url) thumbs[media.id] = url;
          if (media.media_type === "VIDEO" && media.media_url) {
            vids[media.id] = media.media_url;
          }
        }
      }
      setThumbnails(thumbs);
      setVideos(vids);
      writeCache(cacheKey, { thumbs, videos: vids });
    });

    return () => {
      cancelled = true;
    };
  }, [automations]);

  function handleAccountChange(accountId: string) {
    setLoading(true);
    setSelectedAccountId(accountId);
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await fetch(`/api/automations?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      setAutomations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isActive: !isActive } : a))
      );
    } catch (err) {
      console.error("Failed to toggle:", err);
    }
  }

  async function copyReelUrl(auto: Campaign) {
    if (!auto.postUrl) return;
    try {
      await navigator.clipboard.writeText(auto.postUrl);
      setCopiedId(auto.id);
      // The menu stays open a moment so "Copied!" can be read.
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === auto.id ? null : cur));
        setMenuOpenId((cur) => (cur === auto.id ? null : cur));
      }, 1200);
    } catch (err) {
      console.error("Failed to copy reel URL:", err);
    }
  }

  function selectTab(type: AutomationType) {
    setActiveType(type);
    // Keep the tab in the URL so a reload or a shared link opens it again.
    // Native replaceState (synced by Next) instead of router.replace: no
    // server round trip and no remount, so keyboard focus stays on the tab.
    window.history.replaceState(null, "", `/automations?tipo=${automationTypeSlug(type)}`);
  }

  async function deleteAutomation(id: string) {
    setConfirmDeleteId(null);
    try {
      await fetch(`/api/automations?id=${id}`, { method: "DELETE" });
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  }

  // The copy is made server-side from the stored campaign, so settings this
  // list never loads (the DM trigger, the follow-up, the link button label)
  // still come along.
  async function duplicateAutomation(id: string) {
    setMenuOpenId(null);
    try {
      const res = await fetch(`/api/automations/duplicate?id=${id}`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        if (data.data?.mediaSkipped) window.alert(t("The copy was created without images and videos: your media storage is full."));
        void fetchAutomations();
      }
      else console.error("Duplicate failed:", data.error);
    } catch (err) {
      console.error("Failed to duplicate:", err);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-20 max-w-md rounded-card bg-surface" />
        <div className="h-12 max-w-sm rounded-control bg-surface" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card h-[84px]" />
          ))}
        </div>
      </div>
    );
  }

  const typeOf = (a: Campaign): AutomationType => a.type ?? "COMMENTS";
  const ofType = automations.filter((a) => typeOf(a) === activeType);
  const countFor = (type: AutomationType) => automations.filter((a) => typeOf(a) === type).length;
  const tabText: Record<AutomationType, { label: string; sentence: string; example: string }> = {
    COMMENTS: {
      label: t("Comments"),
      sentence: t("Answer people who comment on your posts and reels: by DM and, if you want, publicly under the comment."),
      example: t("Someone comments LINK on your reel and gets the link by DM."),
    },
    STORIES: {
      label: t("Stories"),
      sentence: t("Answer people who reply to your stories or mention you in their own stories."),
      example: t("Someone replies PRICE to your story and gets the price list."),
    },
    DIRECT: {
      label: t("Direct"),
      sentence: t("Answer direct messages automatically, by keyword or to every new conversation."),
      example: t("Someone writes HOURS and gets your opening hours."),
    },
  };
  const newHref = `/campaigns/new?tipo=${automationTypeSlug(activeType)}`;
  // Accounts that answer nothing: disconnected (reconnect in Accounts) or
  // turned off in the Accounts tab.
  const reconnectAccounts = Array.from(
    new Set(automations.filter((a) => accountNeedsReconnect(a.instagramAccount)).map((a) => a.instagramAccount.username))
  );
  const pausedAccounts = Array.from(
    new Set(
      automations
        .filter((a) => a.instagramAccount.automationsEnabled === false && !accountNeedsReconnect(a.instagramAccount))
        .map((a) => a.instagramAccount.username)
    )
  );
  // Active automations that catch the same events as another one: a warning
  // when one of the two stops answering, a neutral tag when each answers its part.
  const candidates: ConflictCandidate[] = automations.map((a) => ({
    ...a,
    type: typeOf(a),
    postIds: a.postIds ?? [],
  }));
  const conflictsOf = (id: string) => {
    const self = candidates.find((c) => c.id === id);
    return self?.isActive ? findConflicts(self, candidates) : [];
  };

  const query = search.trim().toLowerCase();
  const filtered = ofType.filter((a) => {
    if (statusFilter === "active" && !a.isActive) return false;
    if (statusFilter === "paused" && a.isActive) return false;
    if (!query) return true;
    return (
      a.name.toLowerCase().includes(query) ||
      a.keywords.some((k) => k.toLowerCase().includes(query)) ||
      a.dmMessage.toLowerCase().includes(query)
    );
  });
  const confirmTarget = automations.find((a) => a.id === confirmDeleteId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Automations")}
        description={
          <>
            <p>{tabText[activeType].sentence}</p>
            <p className="mt-1 text-[13px] text-faint">
              {t("Example:")} {tabText[activeType].example}
            </p>
          </>
        }
        actions={
          <>
            <ButtonLink href="/campaigns/import" variant="secondary" icon="upload">
              {t("Import")}
            </ButtonLink>
            <ButtonLink href={newHref} variant="primary" icon="plus">
              {t("New automation")}
            </ButtonLink>
          </>
        }
      />

      {reconnectAccounts.length > 0 && (
        <Alert
          tone="error"
          role="status"
          action={
            <Link href="/accounts" className="font-semibold underline underline-offset-4">
              {t("Open Accounts")}
            </Link>
          }
        >
          {t(
            reconnectAccounts.length === 1
              ? "@{accounts}'s connection to Instagram expired: its automations won't answer until you reconnect."
              : "The connection of @{accounts} to Instagram expired: their automations won't answer until you reconnect.",
            { accounts: reconnectAccounts.join(", @") }
          )}
        </Alert>
      )}
      {pausedAccounts.length > 0 && (
        <Alert
          tone="warning"
          role="status"
          action={
            <Link href="/accounts" className="font-semibold underline underline-offset-4">
              {t("Open Accounts")}
            </Link>
          }
        >
          {t(pausedAccounts.length === 1 ? "@{accounts} is turned off: its automations won't answer until you turn it back on." : "@{accounts} are turned off: their automations won't answer until you turn them back on.", {
            accounts: pausedAccounts.join(", @"),
          })}
        </Alert>
      )}

      {/* Channel tabs, then search, status and account */}
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <SegmentedControl
          kind="tabs"
          label={t("Automation channels")}
          value={activeType}
          onChange={(type) => selectTab(type)}
          items={TABS.map((type) => ({ value: type, label: tabText[type].label, icon: CHANNEL_ICON[type], count: countFor(type) }))}
        />
        {accounts.length > 1 && <AccountSelect accounts={accounts} value={selectedAccountId} onChange={handleAccountChange} />}
      </div>

      {ofType.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-sm">
            <span className="sr-only">{t("Search by name, keyword or message…")}</span>
            <Icon name="search" size={16} strokeWidth={2} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search by name, keyword or message…")}
              className="field !pl-10"
            />
          </label>
          <SegmentedControl
            size="sm"
            label={t("Status")}
            value={statusFilter}
            onChange={setStatusFilter}
            items={(["all", "active", "paused"] as const).map((s) => ({ value: s, label: label(s) }))}
          />
        </div>
      )}

      {/* Empty state */}
      {ofType.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-8 text-center sm:p-12">
          <span className="grid h-12 w-12 place-items-center rounded-control border border-accent-soft-border bg-accent-soft text-accent-soft-icon">
            <Icon name={CHANNEL_ICON[activeType]} size={22} />
          </span>
          <h2 className="title-section">{t("No {channel} automations yet", { channel: tabText[activeType].label })}</h2>
          <p className="max-w-sm text-sm text-muted">{tabText[activeType].sentence}</p>
          <ButtonLink href={newHref} variant="primary" icon="plus" className="mt-2">
            {t("New automation")}
          </ButtonLink>
        </Card>
      )}

      {/* No matches for the current filter */}
      {ofType.length > 0 && filtered.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted">{t("No automations match your search.")}</Card>
      )}

      {/* Automation cards */}
      <ul className="space-y-3">
        {filtered.map((auto) => {
          const videoUrl = auto.postId ? videos[auto.postId] : undefined;
          const thumb = auto.postId ? thumbnails[auto.postId] : undefined;
          const type = typeOf(auto);
          const accountOff = auto.instagramAccount.automationsEnabled === false;
          const reconnect = accountNeedsReconnect(auto.instagramAccount);
          const { conflicts: rowConflicts, splits: rowSplits } = byKind(conflictsOf(auto.id));
          const nameId = `automation-${auto.id}`;
          const status: { tone: StatusTone; text: string } = !auto.isActive
            ? { tone: "neutral", text: t("Paused") }
            : reconnect
              ? { tone: "error", text: t("Reconnect account") }
              : accountOff
              ? { tone: "warning", text: t("Account turned off") }
              : auto.pendingNextReel
                ? { tone: "warning", text: t("Waiting for next reel") }
                : { tone: "success", text: t("Active") };
          const facts = [
            type === "COMMENTS" && auto.matchAnyPost ? t("All posts") : null,
            type === "COMMENTS" && (auto.postIds?.length ?? 0) > 1 ? t("{count} checked posts", { count: auto.postIds?.length ?? 0 }) : null,
            auto.requireFollow ? t("Follow gate") : null,
            type === "STORIES" && auto.triggerStoryReplies ? t("Story replies") : null,
            type === "STORIES" && auto.triggerStoryMentions && auto.matchAnyWord ? t("Story mentions") : null,
            (auto.media?.length ?? 0) > 0 ? t("Media: {count}", { count: auto.media?.length ?? 0 }) : null,
            auto.trackedLinks.length >= 2 ? t("2 links") : null,
          ].filter(Boolean);
          return (
            <li
              key={auto.id}
              onClick={() => router.push(`/campaigns/${auto.id}`)}
              className="card card-interactive flex cursor-pointer flex-wrap items-center gap-x-7 gap-y-4 px-5 py-[18px]"
            >
              {/* Post thumbnail (plays the reel) or the channel icon */}
              <div className="flex min-w-0 flex-[1_1_300px] items-center gap-3.5">
                <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                  {(auto.postIds?.length ?? 0) > 1 && thumb && (
                    <span className="absolute -right-1.5 -top-1.5 z-10 rounded-full bg-gradient-accent px-1.5 text-[10px] font-semibold text-on-accent">
                      +{(auto.postIds?.length ?? 1) - 1}
                    </span>
                  )}
                  {thumb && videoUrl ? (
                    <button type="button" onClick={() => setPlayingVideo({ url: videoUrl, postUrl: auto.postUrl })} aria-label={t("Play reel preview")} className="block rounded-control">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumb} alt={t("Campaign reel")} className="h-[42px] w-[42px] rounded-control border border-card-border object-cover" />
                    </button>
                  ) : thumb ? (
                    <a href={auto.postUrl ?? "#"} target="_blank" rel="noreferrer" className="block rounded-control">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumb} alt={t("Campaign post")} className="h-[42px] w-[42px] rounded-control border border-card-border object-cover" />
                    </a>
                  ) : (
                    <span aria-hidden="true" className="grid h-[42px] w-[42px] place-items-center rounded-control border border-accent-soft-border bg-accent-soft text-accent-soft-icon">
                      <Icon name={CHANNEL_ICON[type]} size={19} strokeWidth={1.9} />
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <h2 id={nameId} className="truncate font-display text-base font-semibold text-heading">
                      <Link href={`/campaigns/${auto.id}`} onClick={(e) => e.stopPropagation()} className="rounded-sm hover:text-accent-fg">
                        {auto.name}
                      </Link>
                    </h2>
                    <span className="text-xs text-faint">@{auto.instagramAccount.username}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                    {auto.matchAnyWord && (
                      <span className="chip">{type === "COMMENTS" ? t("Any comment") : type === "STORIES" ? t("Any reply") : t("Any message")}</span>
                    )}
                    {auto.keywords.slice(0, 4).map((kw) => (
                      <span key={kw} className="chip">
                        {kw}
                      </span>
                    ))}
                    {auto.keywords.length > 4 && <span className="text-xs text-faint">+{auto.keywords.length - 4}</span>}
                    {facts.length > 0 && <span className="ml-0.5">{facts.join(" · ")}</span>}
                    {needsReview({ ...auto, type: typeOf(auto) }) && <ReviewTag />}
                    {rowConflicts.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning"
                        data-note="conflict"
                        title={rowConflicts.map((c) => overlapText(c, i18n)).join("\n")}
                      >
                        <Icon name="alert" size={13} strokeWidth={2} />
                        {rowConflicts.length === 1
                          ? t("Conflict with “{name}”", { name: rowConflicts[0].other.name })
                          : t("Conflicts with {count} automations", { count: rowConflicts.length })}
                      </span>
                    )}
                    {rowSplits.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-muted"
                        data-note="split"
                        title={rowSplits.map((c) => overlapText(c, i18n)).join("\n")}
                      >
                        <Icon name="info" size={13} strokeWidth={2} />
                        {splitTag(channelOfType(type), rowSplits, i18n)}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[13px] text-faint">&ldquo;{auto.dmMessage}{t("”")}</p>
                </div>
              </div>

              {/* Numbers */}
              <dl className="flex flex-none items-center gap-6">
                <div className="flex flex-col-reverse gap-0.5">
                  <dt className="text-xs text-faint">{t("sent")}</dt>
                  <dd className="font-display text-[17px] font-semibold text-heading">{auto.analytics.sent}</dd>
                </div>
                <div className="flex flex-col-reverse gap-0.5">
                  <dt className="text-xs text-faint">{t("clicks")}</dt>
                  <dd className="font-display text-[17px] font-semibold text-heading">{auto.analytics.clicks}</dd>
                </div>
                <div className="flex flex-col-reverse gap-0.5">
                  <dt className="text-xs text-faint">{t("CTR")}</dt>
                  <dd className="font-display text-[17px] font-semibold text-heading">{auto.analytics.ctr}%</dd>
                </div>
                {auto.analytics.failed > 0 && (
                  <div className="flex flex-col-reverse gap-0.5">
                    <dt className="text-xs text-faint">{t("failed")}</dt>
                    <dd className="font-display text-[17px] font-semibold text-error">{auto.analytics.failed}</dd>
                  </div>
                )}
              </dl>

              {/* Status, switch and more actions */}
              <div className="ml-auto flex flex-none items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <StatusDot tone={status.tone} className="min-w-[116px]">
                  {status.text}
                </StatusDot>
                <Switch checked={auto.isActive} onChange={() => void toggleActive(auto.id, auto.isActive)} labelledBy={nameId} />
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpenId((cur) => (cur === auto.id ? null : auto.id))}
                    aria-label={t("More actions")}
                    aria-expanded={menuOpenId === auto.id}
                    className={buttonClass("ghost", "icon")}
                  >
                    <Icon name="more" size={18} strokeWidth={3} />
                  </button>
                  {menuOpenId === auto.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                      <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-control border border-border bg-dialog p-1 shadow-dialog">
                        {auto.postUrl && (
                          <button type="button" onClick={() => void copyReelUrl(auto)} className="flex min-h-10 w-full items-center gap-2 rounded-item px-3 text-left text-sm text-foreground hover:bg-surface-hover">
                            <Icon name="copy" size={16} />
                            {copiedId === auto.id ? t("Copied!") : t("Copy URL")}
                          </button>
                        )}
                        <button type="button" onClick={() => void duplicateAutomation(auto.id)} className="flex min-h-10 w-full items-center gap-2 rounded-item px-3 text-left text-sm text-foreground hover:bg-surface-hover">
                          <Icon name="copy" size={16} />
                          {t("Duplicate")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            setConfirmDeleteId(auto.id);
                          }}
                          className="flex min-h-10 w-full items-center gap-2 rounded-item px-3 text-left text-sm text-error hover:bg-error-soft"
                        >
                          <Icon name="trash" size={16} />
                          {t("Delete")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={confirmTarget !== null}
        onClose={() => setConfirmDeleteId(null)}
        tone="danger"
        title={confirmTarget?.name ?? ""}
        description={t("Delete this automation? Its images and videos are deleted too. This cannot be undone.")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>
              {t("Cancel")}
            </Button>
            <Button variant="danger" onClick={() => confirmTarget && void deleteAutomation(confirmTarget.id)}>
              {t("Delete")}
            </Button>
          </>
        }
      />

      {/* Reel preview */}
      <Dialog
        open={playingVideo !== null}
        onClose={() => setPlayingVideo(null)}
        size="lg"
        title={t("Play reel preview")}
        footer={
          <>
            {playingVideo?.postUrl && (
              <ButtonAnchor href={playingVideo.postUrl} target="_blank" rel="noreferrer" variant="secondary" icon="external">
                {t("Open on Instagram")}
              </ButtonAnchor>
            )}
            <Button variant="secondary" onClick={() => setPlayingVideo(null)}>
              {t("Close")}
            </Button>
          </>
        }
      >
        {playingVideo && <video src={playingVideo.url} controls autoPlay loop playsInline className="max-h-[70vh] w-full rounded-control bg-scrim" />}
      </Dialog>
    </div>
  );
}

"use client";

/**
 * Automation editor
 *
 * Two panes: the steps on the left (1. When, 2. Keyword, 3. What the person
 * receives, 4. Extras — Comments only) and a live phone preview on the right,
 * with a plain-language summary on top. One editor for the three automation
 * types (Comments, Stories, Direct); each step only shows what works for the
 * chosen type. Used for both creating and editing.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import PostPicker from "@/components/post-picker";
import CampaignPreview, { type PreviewTab } from "@/components/campaign-preview";
import {
  Help,
  MediaPicker,
  Step,
  StorageUsage,
  type AutomationKind,
  type BuilderMedia,
  type MediaSlot,
} from "@/components/automation-builder-parts";
import { automationSummary } from "@/lib/automation/summary";
import { automationTypeSlug } from "@/lib/automation/type-slugs";
import { readCache, writeCache } from "@/lib/client-cache";
import {
  IMPORT_QUEUE_KEY,
  IMPORT_ACCOUNT_KEY,
  type ImportRow,
} from "@/lib/import-queue";

type TriggerScope = "specific" | "any" | "next";
type MatchMode = "specific" | "any";

interface LoadedCampaign {
  id: string;
  name: string;
  postId: string | null;
  postUrl: string | null;
  pendingNextReel: boolean;
  matchAnyPost: boolean;
  keywords: string[];
  matchAnyWord: boolean;
  wholeWordMatch?: boolean;
  type?: AutomationKind;
  triggerStoryReplies?: boolean;
  triggerStoryMentions?: boolean;
  replyCooldownHours?: number;
  media?: Array<{ id: string; slot: string | null; kind: "IMAGE" | "VIDEO"; url: string; originalName?: string | null }>;
  dmMessage: string;
  openingDmEnabled: boolean;
  openingDmMessage: string | null;
  openingDmButtonLabel: string | null;
  linkButtonLabel: string | null;
  requireFollow: boolean;
  followPromptMessage: string | null;
  followPromptButtonLabel: string | null;
  followUpEnabled: boolean;
  followUpMessage: string | null;
  followUpDelayMinutes: number | null;
  publicReplyEnabled: boolean;
  publicReplyMessage: string | null;
  publicReplyMessages: string[];
  isActive: boolean;
  instagramAccountId: string;
  trackedLinks?: { destinationUrl: string; label?: string | null }[];
}

interface CampaignBuilderProps {
  mode: "new" | "edit";
  campaignId?: string;
  /** New automations: which tab "New automation" was clicked on. */
  initialType?: AutomationKind;
}

const EMPTY_MEDIA: Record<MediaSlot, BuilderMedia[]> = { FOLLOW_PROMPT: [], MAIN: [], FOLLOW_UP: [] };

function Radio({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
        checked ? "border-accent bg-accent/5" : "border-border hover:border-border-hover"
      }`}
    >
      <span
        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
          checked ? "border-accent" : "border-zinc-500"
        }`}
      >
        {checked && <span className="h-2 w-2 rounded-full bg-accent" />}
      </span>
      <span className="flex-1 text-foreground">{children}</span>
    </button>
  );
}

function Toggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? "bg-accent" : "bg-zinc-300"
      }`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
          on ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

export default function CampaignBuilder({ mode, campaignId, initialType = "COMMENTS" }: CampaignBuilderProps) {
  const { t, message } = useI18n();
  const router = useRouter();

  const [loading, setLoading] = useState(mode === "edit");
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);

  const [triggerScope, setTriggerScope] = useState<TriggerScope>("specific");
  const [postId, setPostId] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState<string | null>(null);
  const [postThumb, setPostThumb] = useState<string | null>(null);
  const [postCaption, setPostCaption] = useState("");

  // Post IDs already tied to another automation on this account, so the picker
  // can flag them and the user knows not to double-assign. Maps postId ->
  // the campaign name using it (for the tooltip).
  const [usedPosts, setUsedPosts] = useState<Record<string, string>>({});

  const [matchMode, setMatchMode] = useState<MatchMode>("specific");
  const [keywordText, setKeywordText] = useState("");
  const [wholeWordMatch, setWholeWordMatch] = useState(true);

  const [automationType, setAutomationType] = useState<AutomationKind>(initialType);
  const [triggerStoryReplies, setTriggerStoryReplies] = useState(true);
  const [triggerStoryMentions, setTriggerStoryMentions] = useState(false);
  const [replyCooldownHours, setReplyCooldownHours] = useState(24);
  const [media, setMedia] = useState<Record<MediaSlot, BuilderMedia[]>>(EMPTY_MEDIA);
  const [storageVersion, setStorageVersion] = useState(0);
  const isComments = automationType === "COMMENTS";

  const [publicReplyEnabled, setPublicReplyEnabled] = useState(false);
  const [publicReplyMessages, setPublicReplyMessages] = useState<string[]>([""]);

  const [openingDmEnabled, setOpeningDmEnabled] = useState(false);
  const [openingDmMessage, setOpeningDmMessage] = useState("");
  const [openingDmButtonLabel, setOpeningDmButtonLabel] = useState("");

  const [dmMessage, setDmMessage] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [trackedDestinationUrl, setTrackedDestinationUrl] = useState("");
  const [linkButtonLabel, setLinkButtonLabel] = useState("Open link");
  const [secondLinkOpen, setSecondLinkOpen] = useState(false);
  const [secondaryDestinationUrl, setSecondaryDestinationUrl] = useState("");
  const [secondaryButtonLabel, setSecondaryButtonLabel] = useState("Open link");
  const [requireFollow, setRequireFollow] = useState(false);
  const [followPromptMessage, setFollowPromptMessage] = useState("");
  const [followPromptButtonLabel, setFollowPromptButtonLabel] =
    useState("i'm following");
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [followUpDelayMinutes, setFollowUpDelayMinutes] = useState(0);

  const [previewTab, setPreviewTab] = useState<PreviewTab>("dm");

  // CSV import queue. When present, each save advances to the next row instead
  // of returning to the campaigns list.
  const [importQueue, setImportQueue] = useState<ImportRow[] | null>(null);
  const [importTotal, setImportTotal] = useState(0);

  const keywords = useMemo(
    () =>
      keywordText
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    [keywordText]
  );

  // Fetch the connected account's real avatar for the preview (cache-first so
  // it shows instantly on a return visit instead of a blank circle).
  useEffect(() => {
    if (!selectedAccountId) return;
    let cancelled = false;
    const cacheKey = `ig-avatar:${selectedAccountId}`;
    const cached = readCache<string | null>(cacheKey, 30 * 60 * 1000);
    // Hydrating state from cache is a legitimate effect use here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached.data !== null) setAvatarUrl(cached.data);

    const params = new URLSearchParams({ instagramAccountId: selectedAccountId });
    fetch(`/api/instagram/profile?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const url = d.success ? d.data.profilePictureUrl ?? null : null;
        setAvatarUrl(url);
        writeCache(cacheKey, url);
      })
      .catch(() => {
        if (!cancelled && cached.data === null) setAvatarUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId]);

  // Load accounts (both modes need them for the preview username + selector).
  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success) return;
        const next: AccountOption[] = payload.data.instagramAccounts ?? [];
        setAccounts(next);
        setSelectedAccountId(
          (prev) => prev || payload.data.selectedInstagramAccountId || next[0]?.id || ""
        );
      })
      .catch(() => setAccounts([]));
  }, []);

  // Prefill when editing.
  useEffect(() => {
    if (mode !== "edit" || !campaignId) return;
    fetch("/api/automations", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success) return setNotFound(true);
        const c = (payload.data as LoadedCampaign[]).find((x) => x.id === campaignId);
        if (!c) return setNotFound(true);
        setName(c.name);
        setSelectedAccountId(c.instagramAccountId);
        setTriggerScope(
          c.matchAnyPost ? "any" : c.pendingNextReel ? "next" : "specific"
        );
        setPostId(c.postId);
        setPostUrl(c.postUrl);
        setMatchMode(c.matchAnyWord ? "any" : "specific");
        setKeywordText(c.keywords.join(", "));
        setWholeWordMatch(c.wholeWordMatch ?? true);
        setAutomationType(c.type ?? "COMMENTS");
        setTriggerStoryReplies(c.triggerStoryReplies ?? true);
        setTriggerStoryMentions(c.triggerStoryMentions ?? false);
        setReplyCooldownHours(c.replyCooldownHours ?? 24);
        const loaded: Record<MediaSlot, BuilderMedia[]> = { FOLLOW_PROMPT: [], MAIN: [], FOLLOW_UP: [] };
        for (const m of c.media ?? []) {
          if (m.slot === "FOLLOW_PROMPT" || m.slot === "MAIN" || m.slot === "FOLLOW_UP") {
            loaded[m.slot].push({ id: m.id, kind: m.kind, url: m.url, originalName: m.originalName, attached: true });
          }
        }
        setMedia(loaded);
        setPublicReplyEnabled(c.publicReplyEnabled);
        setPublicReplyMessages(
          c.publicReplyMessages?.length
            ? c.publicReplyMessages
            : c.publicReplyMessage
              ? [c.publicReplyMessage]
              : [""]
        );
        setOpeningDmEnabled(c.openingDmEnabled);
        setOpeningDmMessage(c.openingDmMessage ?? "");
        setOpeningDmButtonLabel(c.openingDmButtonLabel ?? "");
        setDmMessage(c.dmMessage);
        setLinkButtonLabel(c.linkButtonLabel ?? "Open link");
        setIsActive(c.isActive);
        const link = c.trackedLinks?.[0]?.destinationUrl ?? "";
        setTrackedDestinationUrl(link);
        setLinkOpen(Boolean(link));
        const secondLink = c.trackedLinks?.[1];
        setSecondaryDestinationUrl(secondLink?.destinationUrl ?? "");
        setSecondaryButtonLabel(secondLink?.label ?? "Open link");
        setSecondLinkOpen(Boolean(secondLink?.destinationUrl));
        setRequireFollow(c.requireFollow ?? false);
        setFollowPromptMessage(c.followPromptMessage ?? "");
        setFollowPromptButtonLabel(
          c.followPromptButtonLabel ?? "i'm following"
        );
        setFollowUpEnabled(c.followUpEnabled ?? false);
        setFollowUpMessage(c.followUpMessage ?? "");
        setFollowUpDelayMinutes(c.followUpDelayMinutes ?? 0);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [mode, campaignId]);

  // Track which posts on the selected account are already assigned to an
  // automation, so the picker can highlight them. The campaign being edited is
  // excluded — its own post should read as selected, not "taken".
  useEffect(() => {
    if (!selectedAccountId) return;
    let cancelled = false;
    fetch("/api/automations", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled || !payload.success) return;
        const map: Record<string, string> = {};
        for (const a of payload.data as LoadedCampaign[]) {
          if (!a.postId) continue;
          if (a.instagramAccountId !== selectedAccountId) continue;
          if (mode === "edit" && a.id === campaignId) continue;
          map[a.postId] = a.name;
        }
        setUsedPosts(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId, mode, campaignId]);

  // Prefill the editable fields from one queued import row. The reel is left
  // unset so the user picks it per row.
  function prefillFromRow(row: ImportRow) {
    setName(row.name ?? "");
    setTriggerScope("specific");
    setPostId(null);
    setPostUrl(null);
    setPostThumb(null);
    setPostCaption("");
    setMatchMode("specific");
    setKeywordText((row.keywords ?? []).join(", "));
    setDmMessage(row.dmMessage ?? "");
    setPublicReplyEnabled(Boolean(row.publicReply));
    setPublicReplyMessages(row.publicReply ? [row.publicReply] : [""]);
    const hasOpening = Boolean(row.openingDmMessage);
    setOpeningDmEnabled(hasOpening);
    setOpeningDmMessage(row.openingDmMessage ?? "");
    setOpeningDmButtonLabel(
      row.openingDmButtonLabel || (hasOpening ? "Send link" : "")
    );
    const link = row.trackedUrl ?? "";
    setTrackedDestinationUrl(link);
    setLinkOpen(Boolean(link));
    setError(null);
  }

  // Pick up a staged CSV import (new mode only) and prefill the first row.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (mode !== "new") return;
    try {
      const raw = window.localStorage.getItem(IMPORT_QUEUE_KEY);
      const acct = window.localStorage.getItem(IMPORT_ACCOUNT_KEY);
      if (!raw) return;
      const queue = JSON.parse(raw) as ImportRow[];
      if (!Array.isArray(queue) || queue.length === 0) return;
      setImportQueue(queue);
      setImportTotal(queue.length);
      if (acct) setSelectedAccountId(acct);
      prefillFromRow(queue[0]);
    } catch {
      // ignore a malformed queue
    }
  }, [mode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const username =
    accounts.find((a) => a.id === selectedAccountId)?.username ?? "yourbrand";

  const typeLabel =
    automationType === "COMMENTS" ? t("Comments") : automationType === "STORIES" ? t("Stories") : t("Direct");
  const totalMedia = media.FOLLOW_PROMPT.length + media.MAIN.length + media.FOLLOW_UP.length;
  const mediaBlockedInComments = isComments && !openingDmEnabled && totalMedia > 0;
  const commentsMediaNote = isComments && !openingDmEnabled
    ? t("In Comments, images and videos are only sent after the person taps the opening DM button. Turn on the opening DM in this step to add media.")
    : null;
  const summary = automationSummary(
    { t },
    {
      type: automationType,
      scope: triggerScope,
      keywords,
      anyWord: matchMode === "any",
      storyReplies: triggerStoryReplies,
      storyMentions: triggerStoryMentions,
      hasLink: Boolean(trackedDestinationUrl.trim()),
      requireFollow,
      images: media.MAIN.filter((m) => m.kind === "IMAGE").length,
      videos: media.MAIN.filter((m) => m.kind === "VIDEO").length,
      followUp: followUpEnabled,
      followUpMinutes: followUpDelayMinutes,
      publicReply: isComments && publicReplyEnabled,
      cooldownHours: replyCooldownHours,
    }
  );
  const setSlotMedia = (slot: MediaSlot) => (items: BuilderMedia[]) =>
    setMedia((prev) => ({ ...prev, [slot]: items }));
  const bumpStorage = () => setStorageVersion((v) => v + 1);
  const saveBlocked = saving || mediaBlockedInComments;

  function handlePostSelect(
    id: string,
    url?: string,
    thumb?: string,
    caption?: string
  ) {
    setPostId(id);
    setPostUrl(url ?? null);
    setPostThumb(thumb ?? null);
    setPostCaption(caption ?? "");
  }

  function ensureLinkToken() {
    setDmMessage((cur) => (cur.includes("{link}") ? cur : `${cur.trim()} {link}`.trim()));
  }

  async function handleSubmit(activeValue: boolean) {
    setError(null);

    if (!selectedAccountId) return setError(t("Connect an Instagram account first."));
    if (isComments && triggerScope === "specific" && !postId)
      return setError(t("Pick a post or reel to trigger the campaign."));
    if (matchMode === "specific" && keywords.length === 0)
      return setError(t("Add at least one keyword, or switch to any word."));
    if (automationType === "STORIES" && !triggerStoryReplies && !(triggerStoryMentions && matchMode === "any"))
      return setError(t("Choose at least one: story replies or story mentions"));
    if (!dmMessage.trim()) return setError(t("Add the DM with the link."));
    if (isComments && openingDmEnabled && (!openingDmMessage.trim() || !openingDmButtonLabel.trim()))
      return setError(t("Your opening DM needs a message and a button label."));
    // Comments: media only goes out after the opening DM's button (Meta sends
    // the first reply to a comment as text only). Without it, it never would.
    if (mediaBlockedInComments)
      return setError(t("In Comments, images and videos are only sent after the person taps the opening DM button. Turn on the opening DM or remove the media."));

    setSaving(true);

    const includedSlots: MediaSlot[] = ["MAIN", ...(requireFollow ? (["FOLLOW_PROMPT"] as const) : []), ...(followUpEnabled ? (["FOLLOW_UP"] as const) : [])];
    const payload = {
      name: name.trim() || t("{type} automation for @{username}", { type: typeLabel, username }),
      type: automationType,
      instagramAccountId: selectedAccountId,
      postId: isComments && triggerScope === "specific" ? postId : null,
      postUrl: isComments && triggerScope === "specific" ? postUrl : null,
      matchAnyPost: isComments && triggerScope === "any",
      pendingNextReel: isComments && triggerScope === "next",
      matchAnyWord: matchMode === "any",
      keywords: matchMode === "any" ? [] : keywords,
      wholeWordMatch,
      triggerStoryReplies,
      triggerStoryMentions: triggerStoryMentions && matchMode === "any",
      replyCooldownHours,
      media: includedSlots.flatMap((slot) => media[slot].map((m, position) => ({ id: m.id, slot, position }))),
      dmMessage,
      openingDmEnabled: isComments && openingDmEnabled,
      openingDmMessage: isComments && openingDmEnabled ? openingDmMessage : null,
      openingDmButtonLabel: isComments && openingDmEnabled ? openingDmButtonLabel : null,
      publicReplyEnabled: isComments && publicReplyEnabled,
      publicReplyMessages: isComments && publicReplyEnabled
        ? publicReplyMessages.map((m) => m.trim()).filter(Boolean)
        : [],
      trackedDestinationUrl: trackedDestinationUrl.trim() || "",
      linkButtonLabel: linkButtonLabel.trim() || "Open link",
      secondaryDestinationUrl: secondaryDestinationUrl.trim() || "",
      secondaryButtonLabel: secondaryButtonLabel.trim() || "Open link",
      requireFollow,
      followPromptMessage: requireFollow ? followPromptMessage.trim() : "",
      followPromptButtonLabel: requireFollow
        ? followPromptButtonLabel.trim() || "i'm following"
        : "",
      followUpEnabled,
      followUpMessage: followUpEnabled ? followUpMessage.trim() : "",
      followUpDelayMinutes: followUpEnabled ? followUpDelayMinutes : 0,
      isActive: activeValue,
    };

    try {
      const res =
        mode === "new"
          ? await fetch("/api/automations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/automations?id=${campaignId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      const data = await res.json();
      if (data.success) {
        // The post we just assigned is now in use. Reflect it immediately so
        // the picker flags it on the next imported row — the fetch that builds
        // this map doesn't re-run while the builder stays mounted through the
        // import queue.
        if (triggerScope === "specific" && postId) {
          const assignedPostId = postId;
          setUsedPosts((prev) => ({ ...prev, [assignedPostId]: payload.name }));
        }
        // Importing: advance to the next queued row instead of leaving.
        if (importQueue && importQueue.length > 1) {
          const remaining = importQueue.slice(1);
          try {
            window.localStorage.setItem(
              IMPORT_QUEUE_KEY,
              JSON.stringify(remaining)
            );
          } catch {
            // ignore
          }
          setImportQueue(remaining);
          prefillFromRow(remaining[0]);
          setSaving(false);
          if (typeof window !== "undefined") window.scrollTo({ top: 0 });
          return;
        }
        if (importQueue) {
          try {
            window.localStorage.removeItem(IMPORT_QUEUE_KEY);
            window.localStorage.removeItem(IMPORT_ACCOUNT_KEY);
          } catch {
            // ignore
          }
        }
        // refresh() busts the router cache so the list reflects the save
        // instead of landing on a stale (empty) list.
        router.push(`/automations?tipo=${automationTypeSlug(automationType)}`);
        router.refresh();
      } else {
        // Surface the specific rule that failed instead of "Invalid input".
        const fieldErrors = data.details?.fieldErrors as
          | Record<string, string[]>
          | undefined;
        const firstField = fieldErrors && Object.keys(fieldErrors)[0];
        setError(
          firstField
            ? message(fieldErrors[firstField][0])
            : message(data.error, "Failed to save campaign")
        );
        if (typeof window !== "undefined")
          window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setError(t("Failed to save campaign"));
    } finally {
      setSaving(false);
    }
  }

  // Skip the current imported row without saving a campaign for it, advancing
  // to the next one (or finishing the import if it was the last).
  function skipRow() {
    if (!importQueue) return;
    setError(null);
    if (importQueue.length > 1) {
      const remaining = importQueue.slice(1);
      try {
        window.localStorage.setItem(IMPORT_QUEUE_KEY, JSON.stringify(remaining));
      } catch {
        // ignore
      }
      setImportQueue(remaining);
      prefillFromRow(remaining[0]);
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
      return;
    }
    // Last row skipped — finish the import.
    try {
      window.localStorage.removeItem(IMPORT_QUEUE_KEY);
      window.localStorage.removeItem(IMPORT_ACCOUNT_KEY);
    } catch {
      // ignore
    }
    router.push(`/automations?tipo=${automationTypeSlug(automationType)}`);
    router.refresh();
  }

  if (loading) {
    return <div className="panel h-64 rounded" />;
  }

  if (notFound) {
    return (
      <div className="panel rounded p-8 text-center">
        <p className="text-sm text-muted">{t("Campaign not found.")}</p>
        <button
          onClick={() => router.push(`/automations?tipo=${automationTypeSlug(automationType)}`)}
          className="mt-4 rounded border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          {t("Back to automations")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {importQueue && (
        <div className="rounded border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
          <span className="font-medium text-foreground">
            {t("Importing {current} of {total}.", { current: importTotal - importQueue.length + 1, total: importTotal })}
          </span>{" "}
          <span className="text-muted">
            {t("Fields are prefilled from your CSV. Pick the reel, edit anything, and save to load the next one — or Skip if you don’t want this one.")}
          </span>
        </div>
      )}

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {mode === "edit" ? (
            <>
              <span className="truncate text-sm font-semibold text-foreground">
                {name || t("Untitled automation")}
              </span>
              <span className="rounded bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">{typeLabel}</span>
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${
                  isActive ? "bg-success/15 text-success" : "bg-zinc-500/15 text-muted"
                }`}
              >
                {isActive ? t("LIVE") : t("PAUSED")}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted">{t("New automation · {type}", { type: typeLabel })}</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {importQueue && (
            <button
              type="button"
              onClick={skipRow}
              disabled={saving}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50"
            >
              {importQueue.length > 1 ? t("Skip") : t("Skip & finish")}
            </button>
          )}
          {mode === "edit" &&
            (isActive ? (
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={saving}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50"
              >
                {t("Stop")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={saveBlocked}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50"
              >
                {t("Go Live")}
              </button>
            ))}
          <button
            type="button"
            onClick={() => handleSubmit(mode === "new" ? true : isActive)}
            disabled={saveBlocked}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? t("Saving…") : mode === "new" ? t("Go Live") : t("Save changes")}
          </button>
        </div>
      </div>

      {/* min-w-0 on the cells: a grid item defaults to min-width:auto, so a
          long string widens the whole page instead of wrapping. */}
      {/* Plain-language summary of what the automation does, live. */}
      <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">{t("In short")}</p>
        <p className="mt-1 text-sm text-foreground">{summary}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
      {/* Left: controls */}
      <div className="space-y-8 min-w-0">
        {error && (
          <div role="alert" className="rounded border border-error/20 bg-error/10 p-3 text-sm text-error">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <label className="text-sm font-semibold text-foreground">
            {t("Automation name")}{" "}
            <span className="font-normal text-muted">{t("(optional)")}</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("e.g. Price list on Direct")}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none"
            maxLength={100}
          />
          {accounts.length > 1 && (
            <div className="pt-2">
              <AccountSelect
                accounts={accounts}
                value={selectedAccountId}
                onChange={(id) => {
                  setSelectedAccountId(id);
                  setPostId(null);
                  setPostUrl(null);
                  setPostThumb(null);
                }}
                includeAll={false}
                label={t("Instagram account")}
              />
            </div>
          )}
        </div>

        {/* 1. When */}
        <Step number={1} title={t("When")}>
          {isComments && (
            <>
              <p className="text-sm text-muted">
                {t("Someone comments on")}
                <Help
                  text={t("Choose which posts this automation watches. A specific post takes priority over “any post” when both match.")}
                  example={t("“Next post or reel” attaches itself to the next reel you publish.")}
                />
              </p>
              <Radio checked={triggerScope === "specific"} onSelect={() => setTriggerScope("specific")}>
                {t("a specific post or reel")}
              </Radio>
              {triggerScope === "specific" && (
                <div className="rounded-lg border border-border p-2">
                  <PostPicker
                    selectedPostId={postId}
                    instagramAccountId={selectedAccountId}
                    usedPostIds={usedPosts}
                    onSelect={handlePostSelect}
                  />
                </div>
              )}
              <Radio checked={triggerScope === "any"} onSelect={() => setTriggerScope("any")}>
                {t("any post or reel")}
              </Radio>
              <Radio checked={triggerScope === "next"} onSelect={() => setTriggerScope("next")}>
                {t("next post or reel")}
              </Radio>
            </>
          )}
          {automationType === "STORIES" && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <span className="text-sm text-foreground">
                  {t("Someone replies to one of your stories")}
                  <Help
                    text={t("Answers the message a person sends when replying to any of your stories.")}
                    example={t("Your story says “Reply PRICE”; whoever replies PRICE gets the price list.")}
                  />
                </span>
                <Toggle on={triggerStoryReplies} onToggle={() => setTriggerStoryReplies(!triggerStoryReplies)} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <span className="text-sm text-foreground">
                  {t("Someone mentions you in their story")}
                  <Help
                    text={t("Answers when a person tags your account in their own story. A mention has no text, so it only works without keywords (step 2). Instagram only reports mentions from public accounts.")}
                    example={t("A customer posts your product and tags you; they get a thank-you with a coupon.")}
                  />
                </span>
                <Toggle on={triggerStoryMentions} onToggle={() => setTriggerStoryMentions(!triggerStoryMentions)} />
              </div>
              {triggerStoryMentions && matchMode !== "any" && (
                <p className="rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
                  {t("Story mentions have no text, so they only work without keywords. Choose “any reply” in step 2.")}
                </p>
              )}
            </>
          )}
          {automationType === "DIRECT" && (
            <p className="rounded-lg border border-border px-3 py-2.5 text-sm text-foreground">
              {t("Someone sends you a direct message")}
              <Help
                text={t("Any DM to your account that is not a reply to a story (those go to Stories automations).")}
                example={t("Someone writes “hi, what are your hours?”.")}
              />
            </p>
          )}
        </Step>

        {/* 2. Keyword */}
        <Step number={2} title={t("Keyword")}>
          <Radio checked={matchMode === "specific"} onSelect={() => setMatchMode("specific")}>
            {t("only when it contains a keyword")}
            <Help
              text={t("The automation only answers when the text contains one of these words. With several automations, the one with a keyword wins over one without.")}
              example={t("LINK, PRICE, COUPON")}
            />
          </Radio>
          {matchMode === "specific" && (
            <div className="space-y-1">
              <input
                value={keywordText}
                onChange={(e) => setKeywordText(e.target.value)}
                placeholder={t("Enter a word or multiple")}
                aria-label={t("Keywords")}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none"
              />
              <p className="text-xs text-muted">{t("Use commas to separate words")}</p>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <span className="text-sm text-foreground">
                  {t("Match part of a word")}
                  <Help
                    text={t("Off: only the exact word counts. On: also counts when the keyword is part of a longer word.")}
                    example={t("With “link” on, “links” also matches.")}
                  />
                </span>
                <Toggle on={!wholeWordMatch} onToggle={() => setWholeWordMatch(!wholeWordMatch)} />
              </div>
            </div>
          )}
          <Radio checked={matchMode === "any"} onSelect={() => setMatchMode("any")}>
            {isComments ? t("any comment") : automationType === "STORIES" ? t("any reply") : t("any message")}
            <Help
              text={t("Answers everything that arrives, without needing a keyword.")}
              example={isComments ? t("Every comment on the post gets the DM.") : t("Every new conversation gets a welcome message.")}
            />
          </Radio>
          {automationType === "DIRECT" && matchMode === "any" && (
            <div role="alert" className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
              <p className="font-semibold">{t("Careful: this answers EVERY direct message")}</p>
              <p className="mt-1 text-xs">
                {t("Including customers who already talk to your team. To avoid spam, each person gets at most one automatic reply per interval below, and nothing is sent while someone from your team is talking to them (24 h after their last message).")}
              </p>
            </div>
          )}
          {!isComments && matchMode === "any" && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm text-foreground">
              <span>{t("Reply to the same person at most once every")}</span>
              <input
                type="number"
                min={1}
                max={168}
                value={replyCooldownHours}
                aria-label={t("Hours between replies to the same person")}
                onChange={(e) => setReplyCooldownHours(Math.max(1, Math.min(168, Math.floor(Number(e.target.value) || 24))))}
                className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-sm focus:border-accent/40 focus:outline-none"
              />
              <span>{t("hours")}</span>
              <Help text={t("Prevents the same person from getting the automatic reply every time they write. Default: 24 hours.")} />
            </div>
          )}
        </Step>

        {/* 3. What the person receives */}
        <Step number={3} title={t("What the person receives")}>
          <StorageUsage version={storageVersion} />

          {isComments && (
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">
                  {t("an opening DM with a button")}
                  <Help
                    text={t("Instagram lets you send only one text message in reply to a comment. With an opening DM, the person taps the button and the conversation opens — then the link, images and videos can be sent.")}
                    example={t("“Want the link? Tap below 👇” + button “Send me the link”.")}
                  />
                </span>
                <Toggle on={openingDmEnabled} onToggle={() => setOpeningDmEnabled(!openingDmEnabled)} />
              </div>
              {openingDmEnabled && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={openingDmMessage}
                    onChange={(e) => setOpeningDmMessage(e.target.value)}
                    placeholder={t("Hey there! I'm so happy you're here 😊")}
                    rows={3}
                    aria-label={t("Opening DM text")}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none resize-none"
                    maxLength={1000}
                  />
                  <input
                    value={openingDmButtonLabel}
                    onChange={(e) => setOpeningDmButtonLabel(e.target.value)}
                    placeholder={t("Send me the link")}
                    aria-label={t("Button label")}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none"
                    maxLength={64}
                  />
                  <p className="text-xs text-muted">{t("This first message is text only: Instagram does not allow images or videos in it.")}</p>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">
                {t("follow me to unlock")}
                <Help
                  text={t("The content is only sent after the person follows the account and taps the button. If Instagram cannot confirm the follow, it is sent anyway.")}
                  example={t("“Follow me and tap the button to get the coupon”.")}
                />
              </span>
              <Toggle on={requireFollow} onToggle={() => setRequireFollow(!requireFollow)} />
            </div>
            {requireFollow && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={followPromptMessage}
                  onChange={(e) => setFollowPromptMessage(e.target.value)}
                  placeholder={t("Follow me and tap the button below to get it 💛")}
                  rows={3}
                  aria-label={t("Follow request text")}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none resize-none"
                  maxLength={1000}
                />
                <input
                  value={followPromptButtonLabel}
                  onChange={(e) => setFollowPromptButtonLabel(e.target.value)}
                  placeholder={t("i'm following")}
                  aria-label={t("Button label")}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none"
                  maxLength={20}
                />
                <MediaPicker
                  items={media.FOLLOW_PROMPT}
                  onChange={setSlotMedia("FOLLOW_PROMPT")}
                  onStorageChange={bumpStorage}
                  blockedReason={media.FOLLOW_PROMPT.length === 0 ? commentsMediaNote : null}
                />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <span className="text-sm text-foreground">
              {t("the main message")}
              <Help
                text={t("Write the message. {link} becomes your tracked link (we count clicks) and {username} becomes the person's name.", { link: "{link}", username: "{username}" })}
                example={t("“Hi {username}! Here is the catalogue: {link}”", { link: "{link}", username: "{username}" })}
              />
            </span>
            <textarea
              value={dmMessage}
              onChange={(e) => setDmMessage(e.target.value)}
              placeholder={t("Write a message")}
              rows={3}
              aria-label={t("Main message text")}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none resize-none"
              maxLength={1000}
            />
            {linkOpen ? (
              <div className="space-y-2">
                <input
                  value={trackedDestinationUrl}
                  onChange={(e) => setTrackedDestinationUrl(e.target.value)}
                  onBlur={ensureLinkToken}
                  placeholder="https://yourlink.com/offer"
                  aria-label={t("Link")}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none"
                />
                <input
                  value={linkButtonLabel}
                  onChange={(e) => setLinkButtonLabel(e.target.value)}
                  placeholder={t("Button label (e.g. Open link)")}
                  maxLength={20}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none"
                />
                {secondLinkOpen ? (
                  <div className="space-y-2 border-t border-border pt-2">
                    <input
                      value={secondaryDestinationUrl}
                      onChange={(e) => setSecondaryDestinationUrl(e.target.value)}
                      placeholder="https://yourlink.com/second"
                      aria-label={t("Second link")}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none"
                    />
                    <input
                      value={secondaryButtonLabel}
                      onChange={(e) => setSecondaryButtonLabel(e.target.value)}
                      placeholder={t("Second button label")}
                      maxLength={20}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSecondLinkOpen(true)}
                    className="w-full rounded-lg border border-border py-2 text-sm text-muted hover:text-foreground"
                  >
                    {t("+ Add A Second Link")}
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setLinkOpen(true)}
                className="w-full rounded-lg border border-border py-2 text-sm text-muted hover:text-foreground"
              >
                {t("+ Add A Link")}
              </button>
            )}
            <MediaPicker
              items={media.MAIN}
              onChange={setSlotMedia("MAIN")}
              onStorageChange={bumpStorage}
              blockedReason={media.MAIN.length === 0 ? commentsMediaNote : null}
            />
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">
                {t("a thank-you message")}
                <Help
                  text={t("A short extra message sent some minutes after the main one (up to 24 hours, Instagram's messaging window).")}
                  example={t("“Thanks for the follow, enjoy! 🙌”")}
                />
              </span>
              <Toggle on={followUpEnabled} onToggle={() => setFollowUpEnabled(!followUpEnabled)} />
            </div>
            {followUpEnabled && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={followUpMessage}
                  onChange={(e) => setFollowUpMessage(e.target.value)}
                  placeholder={t("Btw just wanted to say thanks for following me, I appreciate the support 🙌")}
                  rows={3}
                  aria-label={t("Thank-you message text")}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none resize-none"
                  maxLength={1000}
                />
                <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                  <span className="text-xs text-muted">{t("Send it")}</span>
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={followUpDelayMinutes}
                    aria-label={t("Minutes after the main message")}
                    onChange={(e) =>
                      setFollowUpDelayMinutes(Math.max(0, Math.min(1440, Math.floor(Number(e.target.value) || 0))))
                    }
                    className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground focus:border-accent/40 focus:outline-none"
                  />
                  <span className="text-xs text-muted">{t("minutes after the link")}</span>
                </div>
                <MediaPicker
                  items={media.FOLLOW_UP}
                  onChange={setSlotMedia("FOLLOW_UP")}
                  onStorageChange={bumpStorage}
                  blockedReason={media.FOLLOW_UP.length === 0 ? commentsMediaNote : null}
                />
              </div>
            )}
          </div>

          {mediaBlockedInComments && (
            <p role="alert" className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
              {t("In Comments, images and videos are only sent after the person taps the opening DM button. Turn on the opening DM or remove the media.")}
            </p>
          )}
        </Step>

        {/* 4. Extras — Comments only */}
        {isComments && (
          <Step number={4} title={t("Extras")}>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <span className="text-sm text-foreground">
                {t("reply to the comment publicly")}
                <Help
                  text={t("Also answers under the comment, visible to everyone. Add several variations: one is picked at random each time.")}
                  example={t("“Sent you a DM! 📩”")}
                />
              </span>
              <Toggle on={publicReplyEnabled} onToggle={() => setPublicReplyEnabled(!publicReplyEnabled)} />
            </div>
            {publicReplyEnabled && (
              <div className="space-y-2">
                {publicReplyMessages.map((msg, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={msg}
                      onChange={(e) =>
                        setPublicReplyMessages((prev) => prev.map((m, idx) => (idx === i ? e.target.value : m)))
                      }
                      placeholder={t("Sent you a DM! 📩")}
                      aria-label={t("Public reply {number}", { number: i + 1 })}
                      maxLength={1000}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none"
                    />
                    {publicReplyMessages.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPublicReplyMessages((prev) => prev.filter((_, idx) => idx !== i))}
                        className="shrink-0 px-2 text-muted hover:text-error"
                        aria-label={t("Remove reply")}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {publicReplyMessages.length < 10 && (
                  <button
                    type="button"
                    onClick={() => setPublicReplyMessages((prev) => [...prev, ""])}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    {t("+ Add another reply")}
                  </button>
                )}
              </div>
            )}
          </Step>
        )}
      </div>

      {/* Right: preview */}
      <div>
        <p className="mb-4 text-sm text-muted">{t("Preview")}</p>
        <div className="flex min-w-0 justify-center lg:sticky lg:top-6 lg:block">
          <CampaignPreview
            tab={previewTab}
            onTabChange={setPreviewTab}
            username={username}
            avatarUrl={avatarUrl}
            postThumb={postThumb}
            caption={postCaption}
            sampleComment={keywords[0] ?? ""}
            automationType={automationType}
            storyMode={triggerStoryReplies || !triggerStoryMentions || matchMode !== "any" ? "reply" : "mention"}
            media={{ FOLLOW_PROMPT: media.FOLLOW_PROMPT, MAIN: media.MAIN, FOLLOW_UP: media.FOLLOW_UP }}
            publicReplyEnabled={isComments && publicReplyEnabled}
            publicReplyMessage={publicReplyMessages.find((m) => m.trim()) ?? ""}
            openingDmEnabled={isComments && openingDmEnabled}
            openingDmMessage={openingDmMessage}
            openingDmButtonLabel={openingDmButtonLabel}
            revealMessage={dmMessage}
            hasLink={Boolean(trackedDestinationUrl.trim())}
            linkButtonLabel={linkButtonLabel || "Open link"}
            linkUrl={trackedDestinationUrl.trim() || undefined}
            hasSecondLink={
              secondLinkOpen && Boolean(secondaryDestinationUrl.trim())
            }
            secondLinkButtonLabel={secondaryButtonLabel || "Open link"}
            requireFollow={requireFollow}
            followPromptMessage={followPromptMessage}
            followPromptButtonLabel={followPromptButtonLabel || "i'm following"}
            followUpEnabled={followUpEnabled}
            followUpMessage={followUpMessage}
            followUpDelayMinutes={followUpDelayMinutes}
          />
        </div>
      </div>
      </div>
    </div>
  );
}

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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import PostGrid, { type SelectedPost } from "@/components/post-grid";
import CampaignPreview, { type PreviewTab } from "@/components/campaign-preview";
import HowItWorks from "@/components/how-it-works";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { KeywordChip } from "@/components/ui/chip";
import { CheckCards, RadioCards } from "@/components/ui/choice-cards";
import { StatusDot } from "@/components/ui/status";
import { Switch } from "@/components/ui/switch";
import {
  MediaPicker,
  Step,
  StorageUsage,
  type AutomationKind,
  type BuilderMedia,
  type MediaSlot,
} from "@/components/automation-builder-parts";
import { automationSummary } from "@/lib/automation/summary";
import { editorWarnings, mainMessageKind, type EditorDraft, type WarningId } from "@/lib/automation/editor-warnings";
import { messageLimit } from "@/lib/automation/message-limits";
import { DEFAULT_DM_DELAY_SECONDS, deliveryModeOf, deliverySequence, DM_DELAY_OPTIONS, type DeliveryMode, type DmDelay } from "@/lib/automation/delivery";
import { accountProblem } from "@/lib/automation/account-status";
import { findConflicts, sharedNextReel, type Conflict, type ConflictCandidate } from "@/lib/automation/conflicts";
import {
  AccountNote,
  ConflictNotes,
  Counter,
  FieldNotes,
  Hint,
  Note,
  useConflictText,
  useWarningText,
} from "@/components/editor-notes";
import {
  postScopeOf,
  postScopePayload,
  showsPostGrid,
  summaryScopeOf,
  type PostScope,
} from "@/lib/automation/editor-scope";
import { automationTypeSlug } from "@/lib/automation/type-slugs";
import { readCache, writeCache } from "@/lib/client-cache";
import {
  DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL,
  DEFAULT_FOLLOW_PROMPT_MESSAGE,
  DEFAULT_LINK_BUTTON_LABEL,
  DEFAULT_OPENING_BUTTON_LABEL,
} from "@/lib/campaigns/defaults";
import {
  IMPORT_QUEUE_KEY,
  IMPORT_ACCOUNT_KEY,
  type ImportRow,
} from "@/lib/import-queue";

const MAX_POSTS = 100;
type MatchMode = "specific" | "any";

interface LoadedCampaign {
  id: string;
  name: string;
  createdAt?: string;
  postId: string | null;
  postUrl: string | null;
  postIds?: string[];
  posts?: Array<{ postId: string; postUrl: string | null; publishedAt: string | null }>;
  pendingNextReel: boolean;
  matchAnyPost: boolean;
  keywords: string[];
  matchAnyWord: boolean;
  wholeWordMatch?: boolean;
  type?: AutomationKind;
  triggerStoryReplies?: boolean;
  triggerStoryMentions?: boolean;
  replyCooldownHours?: number;
  dmDelaySeconds?: number;
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

/** Required fields left empty: shown once the person tries to save, not on a blank form. */
const MISSING: WarningId[] = ["postScopeEmpty", "keywordMissing", "mainMissing", "openingIncomplete"];

/** An automation from the list, as the conflict check reads it. */
function candidateOf(a: LoadedCampaign): ConflictCandidate {
  return {
    id: a.id,
    name: a.name,
    type: a.type ?? "COMMENTS",
    createdAt: a.createdAt ?? new Date(0),
    isActive: a.isActive,
    instagramAccountId: a.instagramAccountId,
    keywords: a.keywords,
    matchAnyWord: a.matchAnyWord,
    wholeWordMatch: a.wholeWordMatch ?? true,
    matchAnyPost: a.matchAnyPost,
    pendingNextReel: a.pendingNextReel,
    postIds: a.posts?.map((p) => p.postId) ?? a.postIds ?? [],
    postId: a.postId,
    triggerStoryReplies: a.triggerStoryReplies ?? true,
    triggerStoryMentions: a.triggerStoryMentions ?? false,
  };
}

function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  /** Accessible name; the visible text sits next to the switch. */
  label: string;
}) {
  return <Switch checked={on} onChange={() => onToggle()} label={label} />;
}

export default function CampaignBuilder({ mode, campaignId, initialType = "COMMENTS" }: CampaignBuilderProps) {
  const { t, message } = useI18n();
  const router = useRouter();

  const [loading, setLoading] = useState(mode === "edit");
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
  // Set on the first save attempt: from then on empty required fields show.
  const [triedToSave, setTriedToSave] = useState(false);
  // Conflicts the API listed for the save just made (the save went through).
  const [savedConflicts, setSavedConflicts] = useState<{ conflicts: Conflict[]; next: () => void } | null>(null);
  // Every automation of the workspace, for the live conflict check.
  const [others, setOthers] = useState<LoadedCampaign[]>([]);
  // When this automation was created (now, for a new one): the oldest wins a tie.
  const [createdAt, setCreatedAt] = useState(() => new Date().toISOString());

  const [name, setName] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);

  // Comments: all posts, the posts checked in the grid, or the next reel.
  const [postScope, setPostScope] = useState<PostScope>("all");
  // Checked posts. Only saved with "Specific posts": switching to another
  // option keeps them on screen, so switching back restores them.
  const [selectedPosts, setSelectedPosts] = useState<SelectedPost[]>([]);
  // New Comments automations: also answer comments from the 72h before.
  const [replyToRecentComments, setReplyToRecentComments] = useState(false);

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
  // Step 3: the main message directly (default for new automations), or
  // steps first (opening DM and/or follow request). Saved automations open on
  // the mode their steps say.
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("direct");
  // Wait before answering, in seconds: 30 for a new automation; a saved one
  // opens on its own value.
  const [dmDelay, setDmDelay] = useState<DmDelay>(DEFAULT_DM_DELAY_SECONDS);
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
  const [linkButtonLabel, setLinkButtonLabel] = useState(DEFAULT_LINK_BUTTON_LABEL);
  const [secondLinkOpen, setSecondLinkOpen] = useState(false);
  const [secondaryDestinationUrl, setSecondaryDestinationUrl] = useState("");
  const [secondaryButtonLabel, setSecondaryButtonLabel] = useState(DEFAULT_LINK_BUTTON_LABEL);
  const [requireFollow, setRequireFollow] = useState(false);
  const [followPromptMessage, setFollowPromptMessage] = useState("");
  const [followPromptButtonLabel, setFollowPromptButtonLabel] =
    useState(DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL);
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
        if (c.createdAt) setCreatedAt(c.createdAt);
        setSelectedAccountId(c.instagramAccountId);
        // A "next post" automation that already found its reel opens on
        // "Specific posts" with that reel checked.
        const stored = postScopeOf(c);
        setPostScope(stored.scope);
        setSelectedPosts(stored.posts);
        setMatchMode(c.matchAnyWord ? "any" : "specific");
        setKeywordText(c.keywords.join(", "));
        setWholeWordMatch(c.wholeWordMatch ?? true);
        setAutomationType(c.type ?? "COMMENTS");
        setTriggerStoryReplies(c.triggerStoryReplies ?? true);
        setTriggerStoryMentions(c.triggerStoryMentions ?? false);
        setReplyCooldownHours(c.replyCooldownHours ?? 24);
        setDmDelay((DM_DELAY_OPTIONS as readonly number[]).includes(c.dmDelaySeconds ?? 0) ? ((c.dmDelaySeconds ?? 0) as DmDelay) : 0);
        setDeliveryMode(deliveryModeOf({ type: c.type ?? "COMMENTS", openingDmEnabled: c.openingDmEnabled, requireFollow: c.requireFollow }));
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
        setLinkButtonLabel(c.linkButtonLabel ?? DEFAULT_LINK_BUTTON_LABEL);
        setIsActive(c.isActive);
        const link = c.trackedLinks?.[0]?.destinationUrl ?? "";
        setTrackedDestinationUrl(link);
        setLinkOpen(Boolean(link));
        const secondLink = c.trackedLinks?.[1];
        setSecondaryDestinationUrl(secondLink?.destinationUrl ?? "");
        setSecondaryButtonLabel(secondLink?.label ?? DEFAULT_LINK_BUTTON_LABEL);
        setSecondLinkOpen(Boolean(secondLink?.destinationUrl));
        setRequireFollow(c.requireFollow ?? false);
        setFollowPromptMessage(c.followPromptMessage ?? "");
        setFollowPromptButtonLabel(
          c.followPromptButtonLabel ?? DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL
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
        setOthers(payload.data as LoadedCampaign[]);
        const map: Record<string, string> = {};
        for (const a of payload.data as LoadedCampaign[]) {
          if (!a.isActive || (a.type ?? "COMMENTS") !== "COMMENTS") continue;
          if (a.instagramAccountId !== selectedAccountId) continue;
          if (mode === "edit" && a.id === campaignId) continue;
          for (const id of a.postIds ?? (a.postId ? [a.postId] : [])) map[id] ??= a.name;
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
    // Each imported row is for one post: the user checks it in the grid.
    setPostScope("posts");
    setSelectedPosts([]);
    setMatchMode("specific");
    setKeywordText((row.keywords ?? []).join(", "));
    setDmMessage(row.dmMessage ?? "");
    setPublicReplyEnabled(Boolean(row.publicReply));
    setPublicReplyMessages(row.publicReply ? [row.publicReply] : [""]);
    const hasOpening = Boolean(row.openingDmMessage);
    setOpeningDmEnabled(hasOpening);
    setRequireFollow(false);
    setDeliveryMode(hasOpening ? "steps" : "direct");
    setOpeningDmMessage(row.openingDmMessage ?? "");
    setOpeningDmButtonLabel(
      row.openingDmButtonLabel || (hasOpening ? DEFAULT_OPENING_BUTTON_LABEL : "")
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
  // Step 2's option without a keyword, named after what arrives.
  const anyLabel = isComments ? t("Any comment") : automationType === "STORIES" ? t("Any reply") : t("Any message");
  // Only the media that will be saved: a step that is off takes none.
  const totalMedia =
    media.MAIN.length + (requireFollow ? media.FOLLOW_PROMPT.length : 0) + (followUpEnabled ? media.FOLLOW_UP.length : 0);
  // Comments with no step ("Direct"): the one reply to a comment is text with
  // a link button, so images and videos cannot go. With a step they go after
  // the tap. Without the opening DM, the follow request is that one reply too.
  const commentsDirect = isComments && !openingDmEnabled && !requireFollow;
  const mediaBlockedInComments = commentsDirect && totalMedia > 0;
  const commentsMediaNote = commentsDirect
    ? t("In Comments, Instagram only lets you send one message to the person who commented: text with a link button. To send an image or video, use “With steps first” (the media goes after the person taps the button) or put the content in the link.")
    : null;
  const followPromptMediaNote =
    isComments && !openingDmEnabled ? t("Without the opening DM, the follow request is the reply to the comment: text only.") : null;

  // Switching mode: "Direct" turns both steps off; "With steps first" turns
  // one on (the opening DM in Comments, the follow request elsewhere) so the
  // automation is never left in steps mode with no step.
  function changeDeliveryMode(mode: DeliveryMode) {
    setDeliveryMode(mode);
    if (mode === "direct") {
      setOpeningDmEnabled(false);
      setRequireFollow(false);
    } else if (!(isComments && openingDmEnabled) && !requireFollow) {
      if (isComments) setOpeningDmEnabled(true);
      else setRequireFollow(true);
    }
  }
  const sequence = deliverySequence({
    type: automationType,
    publicReply: isComments && publicReplyEnabled,
    openingDm: isComments && openingDmEnabled,
    requireFollow,
    delaySeconds: dmDelay,
    followUp: followUpEnabled,
    followUpMinutes: followUpDelayMinutes,
  });
  // "Wait 30 seconds → public reply on the comment → main message by DM".
  const sequenceText = sequence
    .map((item) => {
      if (item.kind === "wait") {
        const delay = item.seconds === 30 ? t("30 seconds") : item.seconds === 60 ? t("1 minute") : t("5 minutes");
        return t("wait {delay}", { delay });
      }
      if (item.kind === "publicReply") return t("public reply on the comment");
      if (item.kind === "followUp") return item.minutes > 0 ? t("thank-you {count} min later", { count: item.minutes }) : t("thank-you right after");
      const label = item.kind === "opening" ? t("opening DM") : item.kind === "follow" ? t("follow request") : t("main message");
      return item.firstDm && item.kind !== "opening" ? t("{item} by DM", { item: label }) : label;
    })
    .join(" → ");
  const sequenceLine = sequenceText.charAt(0).toUpperCase() + sequenceText.slice(1);
  const summary = automationSummary(
    { t },
    {
      type: automationType,
      scope: summaryScopeOf(postScope),
      postCount: selectedPosts.length || 1,
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
      dmDelaySeconds: dmDelay,
    }
  );
  const setSlotMedia = (slot: MediaSlot) => (items: BuilderMedia[]) =>
    setMedia((prev) => ({ ...prev, [slot]: items }));
  const bumpStorage = () => setStorageVersion((v) => v + 1);
  const saveBlocked = saving || mediaBlockedInComments;

  // Everything the editor warns about (lib/automation/editor-warnings.ts).
  const hasLink = Boolean(trackedDestinationUrl.trim());
  const hasSecondLink = secondLinkOpen && Boolean(secondaryDestinationUrl.trim());
  const draft: EditorDraft = {
    type: automationType,
    deliveryMode,
    postScope,
    selectedPostCount: selectedPosts.length,
    matchAnyWord: matchMode === "any",
    keywords,
    wholeWordMatch,
    triggerStoryReplies,
    triggerStoryMentions,
    openingDmEnabled,
    openingDmMessage,
    openingDmButtonLabel,
    requireFollow,
    followPromptMessage,
    followPromptButtonLabel,
    dmMessage,
    hasLink,
    linkButtonLabel,
    hasSecondLink,
    secondaryButtonLabel,
    mediaCount: totalMedia,
    followPromptMediaCount: requireFollow ? media.FOLLOW_PROMPT.length : 0,
    followUpEnabled,
    followUpMessage,
    followUpDelayMinutes,
    publicReplyEnabled,
    publicReplyMessages,
  };
  const allWarnings = editorWarnings(draft);
  // Empty required fields only count as shown once a save was attempted.
  const warnings = triedToSave ? allWarnings : allWarnings.filter((w) => !MISSING.includes(w.id));
  const warningText = useWarningText();
  const conflictText = useConflictText();

  // Conflicts with the other active automations of this account and channel.
  const selfCandidate: ConflictCandidate = {
    id: campaignId ?? "new",
    name: name.trim() || t("Untitled automation"),
    type: automationType,
    createdAt,
    isActive: true,
    instagramAccountId: selectedAccountId,
    keywords: matchMode === "any" ? [] : keywords,
    matchAnyWord: matchMode === "any",
    wholeWordMatch,
    matchAnyPost: postScope === "all",
    pendingNextReel: postScope === "next",
    postIds: postScope === "posts" ? selectedPosts.map((p) => p.id) : [],
    triggerStoryReplies,
    triggerStoryMentions: triggerStoryMentions && matchMode === "any",
  };
  const otherCandidates = others.map(candidateOf);
  const conflicts = findConflicts(selfCandidate, otherCandidates);
  const nextReelShared = isComments ? sharedNextReel(selfCandidate, otherCandidates) : null;
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const accountIssue = accountProblem(selectedAccount);
  const notes = (field: Parameters<typeof FieldNotes>[0]["field"]) => <FieldNotes warnings={warnings} field={field} anyLabel={anyLabel} />;

  function ensureLinkToken() {
    setDmMessage((cur) => (cur.includes("{link}") ? cur : `${cur.trim()} {link}`.trim()));
  }

  async function handleSubmit(activeValue: boolean) {
    setError(null);

    if (!selectedAccountId) return setError(t("Connect an Instagram account first."));
    // What cannot be saved yet: shown next to its field and here.
    setTriedToSave(true);
    const blocking = allWarnings.find((w) => w.tone === "error");
    if (blocking) return setError(warningText(blocking, { anyLabel }));

    setSaving(true);

    const includedSlots: MediaSlot[] = ["MAIN", ...(requireFollow ? (["FOLLOW_PROMPT"] as const) : []), ...(followUpEnabled ? (["FOLLOW_UP"] as const) : [])];
    const payload = {
      name: name.trim() || t("{type} automation for @{username}", { type: typeLabel, username }),
      type: automationType,
      instagramAccountId: selectedAccountId,
      // All posts, the checked posts or the next reel (marks only go with
      // "Specific posts"). postId/postUrl are derived on the server.
      ...(isComments ? postScopePayload(postScope, selectedPosts) : { posts: [], matchAnyPost: false, pendingNextReel: false }),
      ...(mode === "new" ? { replyToRecentComments: isComments && replyToRecentComments } : {}),
      matchAnyWord: matchMode === "any",
      keywords: matchMode === "any" ? [] : keywords,
      wholeWordMatch,
      triggerStoryReplies,
      triggerStoryMentions: triggerStoryMentions && matchMode === "any",
      replyCooldownHours,
      dmDelaySeconds: dmDelay,
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
      linkButtonLabel: linkButtonLabel.trim() || DEFAULT_LINK_BUTTON_LABEL,
      secondaryDestinationUrl: secondaryDestinationUrl.trim() || "",
      secondaryButtonLabel: secondaryButtonLabel.trim() || DEFAULT_LINK_BUTTON_LABEL,
      requireFollow,
      followPromptMessage: requireFollow ? followPromptMessage.trim() : "",
      followPromptButtonLabel: requireFollow
        ? followPromptButtonLabel.trim() || DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL
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
        if (isComments && postScope === "posts" && selectedPosts.length && activeValue) {
          const assigned = selectedPosts.map((p) => p.id);
          setUsedPosts((prev) => ({ ...prev, ...Object.fromEntries(assigned.map((id) => [id, payload.name])) }));
        }
        // The next imported row checks conflicts against this one too.
        if (data.data?.id) setOthers((prev) => [...prev.filter((o) => o.id !== data.data.id), data.data as LoadedCampaign]);
        const proceed = () => {
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
        };
        // Saved. Conflicts with other active automations are listed (the save
        // already went through); closing the list carries on.
        const saved: Conflict[] = Array.isArray(data.conflicts) ? data.conflicts : [];
        if (saved.length) {
          setSavedConflicts({ conflicts: saved, next: proceed });
          return;
        }
        proceed();
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
    return (
      <div className="space-y-5" aria-busy="true">
        <div className="h-16 max-w-md rounded-card bg-surface" />
        <div className="card h-24" />
        <div className="card h-64" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-muted">{t("Campaign not found.")}</p>
        <Button onClick={() => router.push(`/automations?tipo=${automationTypeSlug(automationType)}`)} className="mt-4" icon="arrowLeft">
          {t("Back to automations")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {importQueue && (
        <div className="rounded-control border border-accent-soft-border bg-accent-soft px-4 py-3 text-sm">
          <span className="font-semibold text-accent-soft-fg">
            {t("Importing {current} of {total}.", { current: importTotal - importQueue.length + 1, total: importTotal })}
          </span>{" "}
          <span className="text-muted">
            {t("Fields are prefilled from your CSV. Pick the reel, edit anything, and save to load the next one — or Skip if you don’t want this one.")}
          </span>
        </div>
      )}

      {/* Header: breadcrumb, title and the actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-[13px] text-faint">
            <Link href={`/automations?tipo=${automationTypeSlug(automationType)}`} className="rounded-sm text-accent-fg hover:text-accent-fg-hover">
              {t("Automations")}
            </Link>{" "}
            / {typeLabel}
          </p>
          <h1 className="title-page break-words">
            {mode === "edit" ? name || t("Untitled automation") : t("New automation · {type}", { type: typeLabel })}
          </h1>
          {mode === "edit" && (
            <StatusDot tone={isActive ? "success" : "neutral"} className="mt-2">
              {isActive ? t("LIVE") : t("PAUSED")}
            </StatusDot>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {importQueue && (
            <Button onClick={skipRow} disabled={saving}>
              {importQueue.length > 1 ? t("Skip") : t("Skip & finish")}
            </Button>
          )}
          {mode === "edit" &&
            (isActive ? (
              <Button onClick={() => handleSubmit(false)} disabled={saving} icon="pause">
                {t("Stop")}
              </Button>
            ) : (
              <Button onClick={() => handleSubmit(true)} disabled={saveBlocked} icon="play">
                {t("Go Live")}
              </Button>
            ))}
          <Button variant="primary" onClick={() => handleSubmit(mode === "new" ? true : isActive)} disabled={saveBlocked} loading={saving}>
            {saving ? t("Saving…") : mode === "new" ? t("Go Live") : t("Save changes")}
          </Button>
        </div>
      </div>

      {/* min-w-0 on the cells: a grid item defaults to min-width:auto, so a
          long string widens the whole page instead of wrapping. */}
      {/* Plain-language summary of what the automation does, live. */}
      <HowItWorks summary={summary} live />

      <div className="grid items-start gap-[22px] xl:grid-cols-[minmax(0,1fr)_340px]">
      {/* Left: controls */}
      <div className="min-w-0 space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="card space-y-3 p-5">
          <label htmlFor="automation-name" className="label">
            {t("Automation name")}{" "}
            <span className="font-normal text-muted">{t("(optional)")}</span>
          </label>
          <input
            id="automation-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("e.g. Price list on Direct")}
            className="field"
            maxLength={100}
          />
          {accounts.length > 1 && (
            <div className="pt-2">
              <AccountSelect
                accounts={accounts}
                value={selectedAccountId}
                onChange={(id) => {
                  setSelectedAccountId(id);
                  setSelectedPosts([]);
                }}
                includeAll={false}
                label={t("Instagram account")}
              />
            </div>
          )}
          <AccountNote problem={accountIssue} username={selectedAccount?.username ?? username} />
        </div>

        {/* 1. When */}
        <Step number={1} title={t("When")} aside={username ? `@${username}` : undefined}>
          {isComments && (
            <>
              <p id="post-scope-label" className="text-muted">
                {t("Someone comments on")}
              </p>
              <RadioCards
                name="post-scope"
                labelledBy="post-scope-label"
                value={postScope}
                onChange={setPostScope}
                options={[
                  {
                    value: "all",
                    title: t("All posts and reels"),
                    description: t("Applies to any post or reel, including the ones you publish later."),
                  },
                  {
                    value: "posts",
                    title: t("Specific posts"),
                    description: t("Choose in the grid which posts or reels the automation works on."),
                  },
                  {
                    value: "next",
                    title: t("Next reel"),
                    description: t("Set it up before posting: it starts on the next reel you publish."),
                  },
                ]}
              />
              {postScope === "next" && (
                <Hint>{t("Photos and carousels published before the reel are ignored. Once you publish the reel, the automation attaches to it within 5 minutes.")}</Hint>
              )}
              {nextReelShared && (
                <Note tone="warning" id="nextReelShared">
                  {t("“{name}” is also waiting for the next reel. Both will attach to the same reel and only one answers each comment: the one with a keyword; if tied, the oldest (“{oldest}”).", {
                    name: nextReelShared.others.map((o) => o.name).join("”, “"),
                    oldest: nextReelShared.oldest.id === selfCandidate.id ? t("this one") : nextReelShared.oldest.name,
                  })}
                </Note>
              )}
              {notes("scope")}
              {showsPostGrid(postScope) && (
                <PostGrid
                  instagramAccountId={selectedAccountId}
                  selected={selectedPosts}
                  onChange={setSelectedPosts}
                  usedBy={usedPosts}
                  max={MAX_POSTS}
                />
              )}
              {mode === "new" && (
                <label className="flex items-start gap-3 rounded-control border border-border-subtle bg-surface px-3.5 py-3 text-foreground">
                  <input
                    type="checkbox"
                    checked={replyToRecentComments}
                    onChange={(e) => setReplyToRecentComments(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-accent"
                  />
                  <span className="flex-1">
                    {t("Also reply to people who commented in the last 72h")}
                    <Hint className="mt-1">
                      {t("On: when you save, comments from the last 72 h that match this automation and that nobody from your account answered also get the reply, within a few minutes. Off: only comments made after saving.")}
                    </Hint>
                  </span>
                </label>
              )}
              <Hint>{t("If more than one automation applies to the same comment, only one answers: first the one with a keyword, then the one on specific posts, then the oldest.")}</Hint>
            </>
          )}
          {automationType === "STORIES" && (
            <>
              <p id="story-trigger-label" className="text-muted">
                {t("Check one or both")}
              </p>
              <CheckCards
                labelledBy="story-trigger-label"
                values={[...(triggerStoryReplies ? (["replies"] as const) : []), ...(triggerStoryMentions ? (["mentions"] as const) : [])]}
                onChange={(option, checked) => (option === "replies" ? setTriggerStoryReplies(checked) : setTriggerStoryMentions(checked))}
                options={[
                  {
                    value: "replies",
                    title: t("Story replies"),
                    description: t("When someone replies to one of your stories."),
                  },
                  {
                    value: "mentions",
                    title: t("Story mentions"),
                    description: t("When someone tags your account in their own story. Only arrives from public profiles or private profiles that follow your account. It has no text, so it only works without a keyword."),
                  },
                ]}
              />
              {notes("storyTriggers")}
              <Hint>{t("If more than one automation applies to the same reply or mention, only one answers: first the one with a keyword, then the oldest.")}</Hint>
            </>
          )}
          {automationType === "DIRECT" && (
            <div className="rounded-control border border-border-subtle bg-surface px-3.5 py-3">
              <p className="choice-title">{t("Someone sends you a direct message")}</p>
              <p className="choice-desc">{t("Any DM to your account that is not a reply to a story (those go to Stories automations).")}</p>
            </div>
          )}
          {automationType === "DIRECT" && (
            <Hint>{t("If more than one automation applies to the same message, only one answers: first the one with a keyword, then the oldest.")}</Hint>
          )}
        </Step>

        {/* 2. Keyword */}
        <Step number={2} title={t("Keyword")}>
          <RadioCards
            name="match-mode"
            labelledBy="step-2"
            value={matchMode}
            onChange={setMatchMode}
            options={[
              {
                value: "specific",
                title: t("With a keyword"),
                description: t("Only answers when the text has one of the words you choose."),
              },
              {
                value: "any",
                title: anyLabel,
                description: isComments
                  ? t("Answers every comment, no keyword needed.")
                  : automationType === "STORIES"
                    ? t("Answers every story reply and mention, no keyword needed.")
                    : t("Answers every message, no keyword needed."),
              },
            ]}
          />
          {matchMode === "specific" && (
            <div className="space-y-2">
              <input
                value={keywordText}
                onChange={(e) => setKeywordText(e.target.value)}
                placeholder={t("Enter a word or multiple")}
                aria-label={t("Keywords")}
                className="field"
              />
              <Hint>{t("Separate with commas (up to 10). Case, accents, punctuation and emojis don't matter: PREÇO, preço and preco are the same.")}</Hint>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-hidden="true">
                  {keywords.map((kw) => (
                    <KeywordChip key={kw} size="md">
                      {kw}
                    </KeywordChip>
                  ))}
                </div>
              )}
              {notes("keywords")}
              <div className="rounded-control border border-border-subtle bg-surface py-1.5 pl-3.5 pr-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-foreground">{t("Match part of a word")}</span>
                  <Toggle label={t("Match part of a word")} on={!wholeWordMatch} onToggle={() => setWholeWordMatch(!wholeWordMatch)} />
                </div>
                <Hint className="pb-1.5 pr-2">
                  {t("Off: only the whole word (“link” answers “I want the link!”, not “links”). On: also inside other words (“link” answers “links” and “linking”).")}
                </Hint>
              </div>
            </div>
          )}
          {notes("match")}
          <ConflictNotes conflicts={conflicts} />
          {!isComments && matchMode === "any" && (
            <div className="flex flex-wrap items-center gap-2 rounded-control border border-border-subtle bg-surface px-3.5 py-2.5 text-foreground">
              <span>{t("Reply to the same person at most once every")}</span>
              <input
                type="number"
                min={1}
                max={168}
                value={replyCooldownHours}
                aria-label={t("Hours between replies to the same person")}
                onChange={(e) => setReplyCooldownHours(Math.max(1, Math.min(168, Math.floor(Number(e.target.value) || 24))))}
                className="field !min-h-9 !w-20 !px-2 !py-1"
              />
              <span>{t("hours")}</span>
              <Hint className="basis-full">
                {t("Each person gets at most one reply from this automation every {hours} h (default 24). If someone from your team talks to the person in the Instagram app or Business Suite, the automation stays quiet with that person for 24 h.", { hours: replyCooldownHours })}
              </Hint>
            </div>
          )}
        </Step>

        {/* 3. What the person receives */}
        <Step number={3} title={t("What the person receives")}>
          <StorageUsage version={storageVersion} />

          {/* The order of what the person receives, live. */}
          <p data-sequence className="rounded-control border border-border-subtle bg-surface px-3.5 py-2.5 text-[13px] text-foreground">
            <span className="font-semibold text-heading">{t("Order:")}</span> {sequenceLine}
          </p>

          <RadioCards
            name="delivery-mode"
            labelledBy="step-3"
            value={deliveryMode}
            onChange={changeDeliveryMode}
            options={[
              {
                value: "direct",
                title: t("Direct: the person gets it without tapping anything"),
                description: isComments
                  ? t("The main message goes by DM as the reply to the comment: text with a link button.")
                  : t("Text, images and videos go straight into the conversation."),
              },
              {
                value: "steps",
                title: isComments ? t("With steps first: opening DM and/or follow request") : t("With steps first: follow request"),
                description: t("The person taps a button first; the main message goes after the tap."),
              },
            ]}
          />
          {notes("steps")}

          {deliveryMode === "steps" && (
            <div className="space-y-3">
            {isComments && (
              <div className="rounded-control border border-border-subtle bg-surface p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-heading">{t("Optional step: opening DM with a button")}</span>
                  <Toggle label={t("Optional step: opening DM with a button")} on={openingDmEnabled} onToggle={() => setOpeningDmEnabled(!openingDmEnabled)} />
                </div>
                <Hint className="mt-1.5">
                  {t("The first reply to a comment can only be text (Instagram's rule). With the opening DM, the person taps the button, the conversation opens and then the link, images and videos go. If they reply by typing instead of tapping, the main message goes all the same. If they only read it and do nothing, Instagram does not let you send anything else.")}
                </Hint>
                {openingDmEnabled && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={openingDmMessage}
                      onChange={(e) => setOpeningDmMessage(e.target.value)}
                      placeholder={t("Hey there! I'm so happy you're here 😊")}
                      rows={3}
                      aria-label={t("Opening DM text")}
                      className="field resize-none"
                      maxLength={1000}
                    />
                    <Counter limit={messageLimit(openingDmMessage, "button")} />
                    {notes("opening")}
                    <input
                      value={openingDmButtonLabel}
                      onChange={(e) => setOpeningDmButtonLabel(e.target.value)}
                      placeholder={t("Send me the link")}
                      aria-label={t("Button label")}
                      className="field"
                      maxLength={20}
                    />
                    {notes("openingLabel")}
                    <Hint>{t("This first message is text only: Instagram does not allow images or videos in it.")}</Hint>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-control border border-border-subtle bg-surface p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-heading">{t("Optional step: ask to follow first")}</span>
                <Toggle label={t("Optional step: ask to follow first")} on={requireFollow} onToggle={() => setRequireFollow(!requireFollow)} />
              </div>
              <Hint className="mt-1.5">
                {t("Before the content, the person gets a request to follow with a button. They follow, tap the button and the app checks with Instagram (if it doesn't show yet, it checks again for up to 1 minute). If Instagram can't confirm, the content goes anyway. Asking to follow usually reduces how many people reach the content.")}
              </Hint>
              {requireFollow && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={followPromptMessage}
                    onChange={(e) => setFollowPromptMessage(e.target.value)}
                    placeholder={DEFAULT_FOLLOW_PROMPT_MESSAGE}
                    rows={3}
                    aria-label={t("Follow request text")}
                    className="field resize-none"
                    maxLength={1000}
                  />
                  <Counter limit={messageLimit(followPromptMessage, "button")} />
                  {notes("follow")}
                  <input
                    value={followPromptButtonLabel}
                    onChange={(e) => setFollowPromptButtonLabel(e.target.value)}
                    placeholder={DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL}
                    aria-label={t("Button label")}
                    className="field"
                    maxLength={20}
                  />
                  {notes("followLabel")}
                  <MediaPicker
                    items={media.FOLLOW_PROMPT}
                    onChange={setSlotMedia("FOLLOW_PROMPT")}
                    onStorageChange={bumpStorage}
                    blockedReason={followPromptMediaNote}
                  />
                </div>
              )}
            </div>
            </div>
          )}

          <div className="rounded-control border border-border-subtle bg-surface px-3.5 py-3">
            <label htmlFor="dm-delay" className="font-semibold text-heading">
              {t("Wait before answering")}
            </label>
            <select
              id="dm-delay"
              value={dmDelay}
              onChange={(e) => setDmDelay(Number(e.target.value) as DmDelay)}
              className="field mt-2 sm:max-w-60"
            >
              <option value={0}>{t("Right away")}</option>
              <option value={30}>{t("30 seconds")}</option>
              <option value={60}>{t("1 minute")}</option>
              <option value={300}>{t("5 minutes")}</option>
            </select>
            <Hint className="mt-1.5">
              {t("In Comments, the public reply and the DM go together after the wait. In Stories and Direct, the DM goes after the wait.")}
            </Hint>
          </div>

          <div className="space-y-2.5 rounded-control border border-border-subtle bg-surface p-3.5">
            <span className="font-semibold text-heading">{t("Main message (always sent)")}</span>
            <Hint>
              {t("{username} becomes the person's @. With a link, it goes as a button right below the message; {link} marks where the link goes if Instagram doesn't accept the button.", { link: "{link}", username: "{username}" })}
            </Hint>
            <textarea
              value={dmMessage}
              onChange={(e) => setDmMessage(e.target.value)}
              placeholder={t("Write a message")}
              rows={3}
              aria-label={t("Main message text")}
              className="field resize-none"
              maxLength={1000}
            />
            <Counter limit={messageLimit(dmMessage, mainMessageKind(draft))} />
            {notes("main")}
            {linkOpen ? (
              <div className="space-y-2">
                <input
                  value={trackedDestinationUrl}
                  onChange={(e) => setTrackedDestinationUrl(e.target.value)}
                  onBlur={ensureLinkToken}
                  placeholder="https://yourlink.com/offer"
                  aria-label={t("Link")}
                  className="field"
                />
                <Hint>{t("Clicks are counted.")}</Hint>
                <input
                  value={linkButtonLabel}
                  onChange={(e) => setLinkButtonLabel(e.target.value)}
                  placeholder={t("Button label (e.g. Open link)")}
                  aria-label={t("Button label")}
                  maxLength={20}
                  className="field"
                />
                {notes("linkLabel")}
                {secondLinkOpen ? (
                  <div className="space-y-2 border-t border-border-subtle pt-2.5">
                    <input
                      value={secondaryDestinationUrl}
                      onChange={(e) => setSecondaryDestinationUrl(e.target.value)}
                      placeholder="https://yourlink.com/second"
                      aria-label={t("Second link")}
                      className="field"
                    />
                    <input
                      value={secondaryButtonLabel}
                      onChange={(e) => setSecondaryButtonLabel(e.target.value)}
                      placeholder={t("Second button label")}
                      aria-label={t("Second button label")}
                      maxLength={20}
                      className="field"
                    />
                    {notes("secondLinkLabel")}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSecondLinkOpen(true)}
                    className="btn btn-secondary btn-sm w-full border-dashed"
                  >
                    {t("+ Add A Second Link")}
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setLinkOpen(true)}
                className="btn btn-secondary btn-sm w-full border-dashed"
              >
                {t("+ Add A Link")}
              </button>
            )}
            <MediaPicker
              items={media.MAIN}
              onChange={setSlotMedia("MAIN")}
              onStorageChange={bumpStorage}
              blockedReason={commentsMediaNote}
            />
          </div>

          <div className="rounded-control border border-border-subtle bg-surface p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-heading">{t("a thank-you message")}</span>
              <Toggle label={t("a thank-you message")} on={followUpEnabled} onToggle={() => setFollowUpEnabled(!followUpEnabled)} />
            </div>
            <Hint className="mt-1.5">{t("A short message sent after the main message, with the delay you choose (up to 24 h). It goes once per person.")}</Hint>
            {followUpEnabled && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={followUpMessage}
                  onChange={(e) => setFollowUpMessage(e.target.value)}
                  placeholder={t("Btw just wanted to say thanks for following me, I appreciate the support 🙌")}
                  rows={3}
                  aria-label={t("Thank-you message text")}
                  className="field resize-none"
                  maxLength={1000}
                />
                <Counter limit={messageLimit(followUpMessage, "text")} />
                <div className="flex flex-wrap items-center gap-2 text-foreground">
                  <span className="hint">{t("Send it")}</span>
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={followUpDelayMinutes}
                    aria-label={t("Minutes after the main message")}
                    onChange={(e) =>
                      setFollowUpDelayMinutes(Math.max(0, Math.min(1440, Math.floor(Number(e.target.value) || 0))))
                    }
                    className="field !min-h-9 !w-20 !px-2 !py-1"
                  />
                  <span className="hint">{t("minutes after the link")}</span>
                </div>
                {notes("followUp")}
                <MediaPicker
                  items={media.FOLLOW_UP}
                  onChange={setSlotMedia("FOLLOW_UP")}
                  onStorageChange={bumpStorage}
                  blockedReason={commentsMediaNote}
                />
              </div>
            )}
          </div>

          {notes("media")}
        </Step>

        {/* 4. Extras — Comments only */}
        {isComments && (
          <Step number={4} title={t("Extras")}>
            <div className="rounded-control border border-border-subtle bg-surface py-1.5 pl-3.5 pr-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-heading">{t("reply to the comment publicly")}</span>
                <Toggle label={t("reply to the comment publicly")} on={publicReplyEnabled} onToggle={() => setPublicReplyEnabled(!publicReplyEnabled)} />
              </div>
              <Hint className="pb-1.5 pr-2">
                {t("Answers under the comment, visible to everyone. Each comment gets one of the variations, picked at random. It goes even if the DM fails.")}
              </Hint>
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
                      className="field"
                    />
                    {publicReplyMessages.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPublicReplyMessages((prev) => prev.filter((_, idx) => idx !== i))}
                        className="btn btn-danger-ghost btn-icon shrink-0"
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
                    className="text-[13px] font-medium text-accent-fg hover:text-accent-fg-hover hover:underline"
                  >
                    {t("+ Add another reply")}
                  </button>
                )}
                {notes("publicReply")}
              </div>
            )}
          </Step>
        )}
      </div>

      {/* Right: preview (stacks under the steps on narrower screens) */}
      <div className="min-w-0 xl:sticky xl:top-6">
          <CampaignPreview
            tab={previewTab}
            onTabChange={setPreviewTab}
            username={username}
            avatarUrl={avatarUrl}
            postThumb={selectedPosts[0]?.thumb ?? null}
            caption=""
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
            linkButtonLabel={linkButtonLabel || DEFAULT_LINK_BUTTON_LABEL}
            linkUrl={trackedDestinationUrl.trim() || undefined}
            hasSecondLink={
              secondLinkOpen && Boolean(secondaryDestinationUrl.trim())
            }
            secondLinkButtonLabel={secondaryButtonLabel || DEFAULT_LINK_BUTTON_LABEL}
            requireFollow={requireFollow}
            followPromptMessage={followPromptMessage}
            followPromptButtonLabel={followPromptButtonLabel || DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL}
            followUpEnabled={followUpEnabled}
            followUpMessage={followUpMessage}
            followUpDelayMinutes={followUpDelayMinutes}
            dmDelaySeconds={dmDelay}
          />
      </div>
      </div>

      <Dialog
        open={savedConflicts !== null}
        onClose={() => {
          const next = savedConflicts?.next;
          setSavedConflicts(null);
          next?.();
        }}
        title={t("Automation saved")}
        description={t("Heads-up: it shares triggers with other active automations. Only one answers each comment or message.")}
        footer={
          <Button
            variant="primary"
            onClick={() => {
              const next = savedConflicts?.next;
              setSavedConflicts(null);
              next?.();
            }}
          >
            {importQueue && importQueue.length > 1 ? t("Continue") : t("See automations")}
          </Button>
        }
      >
        <ul className="space-y-2.5">
          {savedConflicts?.conflicts.map((c) => (
            <li key={c.other.id} data-tone={c.never ? "danger" : "warning"} className={c.never ? "text-sm leading-relaxed text-error" : "text-sm leading-relaxed text-warning"}>
              {conflictText(c)}{" "}
              <Link href={`/campaigns/${c.other.id}`} className="font-semibold underline underline-offset-4">
                {t("Open “{name}”", { name: c.other.name })}
              </Link>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

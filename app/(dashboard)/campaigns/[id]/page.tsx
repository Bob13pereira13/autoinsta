"use client";

/**
 * Campaign Detail
 *
 * Clicking a campaign opens this read-only view: a summary of the automation
 * on the left, and Insights / Preview tabs on the right. Edit and Stop/Resume
 * live in the top bar.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import CampaignPreview, { type PreviewMedia, type PreviewTab } from "@/components/campaign-preview";
import { automationSummary } from "@/lib/automation/summary";
import { automationTypeSlug } from "@/lib/automation/type-slugs";

type AutomationType = "COMMENTS" | "STORIES" | "DIRECT";
type Slot = "FOLLOW_PROMPT" | "MAIN" | "FOLLOW_UP";

interface Campaign {
  id: string;
  name: string;
  postId: string | null;
  postUrl: string | null;
  pendingNextReel: boolean;
  matchAnyPost: boolean;
  keywords: string[];
  matchAnyWord: boolean;
  type: AutomationType;
  triggerStoryReplies: boolean;
  triggerStoryMentions: boolean;
  replyCooldownHours: number;
  media?: { id: string; slot: Slot; kind: "IMAGE" | "VIDEO"; url: string; position: number }[];
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
  instagramAccount: { username: string };
  trackedLinks?: {
    destinationUrl: string;
    label?: string | null;
    trackedUrl?: string;
  }[];
  analytics: {
    sent: number;
    skipped: number;
    failed: number;
    clicks: number;
    ctr: number;
  };
}

type Tab = "insights" | "preview";

export default function CampaignDetailPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [postThumb, setPostThumb] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("insights");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("dm");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/automations", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success) return setNotFound(true);
        const found = (payload.data as Campaign[]).find((c) => c.id === id);
        if (!found) return setNotFound(true);
        setCampaign(found);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!campaign) return;
    const acct = campaign.instagramAccountId;
    fetch(`/api/instagram/profile?instagramAccountId=${acct}`)
      .then((r) => r.json())
      .then((d) =>
        setAvatarUrl(d.success ? d.data.profilePictureUrl ?? null : null)
      )
      .catch(() => setAvatarUrl(null));

    if (campaign.postId) {
      fetch(`/api/instagram/posts?instagramAccountId=${acct}&limit=50`)
        .then((r) => r.json())
        .then((payload) => {
          if (!payload.success) return;
          const hit = (
            payload.data as {
              id: string;
              thumbnail_url?: string;
              media_url?: string;
            }[]
          ).find((p) => p.id === campaign.postId);
          setPostThumb(hit?.thumbnail_url ?? hit?.media_url ?? null);
        })
        .catch(() => setPostThumb(null));
    }
  }, [campaign]);

  async function toggleActive() {
    if (!campaign) return;
    setBusy(true);
    try {
      await fetch(`/api/automations?id=${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !campaign.isActive }),
      });
      setCampaign({ ...campaign, isActive: !campaign.isActive });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="panel h-64 rounded" />;
  }
  if (notFound || !campaign) {
    return (
      <div className="panel rounded p-8 text-center">
        <p className="text-sm text-muted">{t("Campaign not found.")}</p>
        <button
          onClick={() => router.push("/automations")}
          className="mt-4 rounded border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          {t("Back to automations")}
        </button>
      </div>
    );
  }

  const publicReplies =
    campaign.publicReplyMessages && campaign.publicReplyMessages.length > 0
      ? campaign.publicReplyMessages
      : campaign.publicReplyMessage
        ? [campaign.publicReplyMessage]
        : [];
  const hasLink = Boolean(campaign.trackedLinks?.[0]?.destinationUrl);
  const hasSecondLink = Boolean(campaign.trackedLinks?.[1]?.destinationUrl);

  const type: AutomationType = campaign.type ?? "COMMENTS";
  const isComments = type === "COMMENTS";
  const typeLabel = type === "COMMENTS" ? t("Comments") : type === "STORIES" ? t("Stories") : t("Direct");
  const trigger = campaign.matchAnyPost
    ? t("Any post or reel")
    : campaign.pendingNextReel
      ? t("Your next reel")
      : t("A specific post or reel");
  const storyTrigger = [
    campaign.triggerStoryReplies ? t("Replies to your stories") : null,
    campaign.triggerStoryMentions && campaign.matchAnyWord ? t("Mentions of you in stories") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const matchText = campaign.matchAnyWord
    ? isComments
      ? t("Any comment")
      : type === "STORIES"
        ? t("Any reply")
        : t("Any message")
    : campaign.keywords.join(", ") || t("No keywords");

  const mediaBySlot: Record<Slot, PreviewMedia[]> = { FOLLOW_PROMPT: [], MAIN: [], FOLLOW_UP: [] };
  for (const m of [...(campaign.media ?? [])].sort((a, b) => a.position - b.position)) {
    mediaBySlot[m.slot]?.push({ kind: m.kind, url: m.url });
  }
  const summary = automationSummary(
    { t },
    {
      type,
      scope: campaign.matchAnyPost ? "any" : campaign.pendingNextReel ? "next" : "specific",
      keywords: campaign.keywords,
      anyWord: campaign.matchAnyWord,
      storyReplies: campaign.triggerStoryReplies,
      storyMentions: campaign.triggerStoryMentions,
      hasLink,
      requireFollow: campaign.requireFollow,
      images: mediaBySlot.MAIN.filter((m) => m.kind === "IMAGE").length,
      videos: mediaBySlot.MAIN.filter((m) => m.kind === "VIDEO").length,
      followUp: Boolean(campaign.followUpEnabled && campaign.followUpMessage),
      followUpMinutes: campaign.followUpDelayMinutes ?? 0,
      publicReply: isComments && publicReplies.length > 0 && campaign.publicReplyEnabled,
      cooldownHours: campaign.replyCooldownHours ?? 24,
    }
  );

  const metrics = [
    { label: t("Sends"), value: campaign.analytics.sent },
    { label: t("Clicks"), value: campaign.analytics.clicks },
    { label: t("CTR"), value: `${campaign.analytics.ctr}%` },
    { label: t("Failed"), value: campaign.analytics.failed },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
      {/* Left: config summary */}
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href={`/automations?tipo=${automationTypeSlug(type)}`}
            className="text-sm text-muted hover:text-foreground"
          >
            {t("← Automations")}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="truncate text-lg font-semibold">{campaign.name}</h1>
          <span
            className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
              campaign.isActive
                ? "bg-success/10 text-success"
                : "bg-zinc-500/10 text-muted"
            }`}
          >
            {campaign.isActive ? t("LIVE") : t("Paused")}
          </span>
          <span className="shrink-0 rounded bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">{typeLabel}</span>
        </div>

        <p className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-foreground">{summary}</p>

        {type === "STORIES" && (
          <Summary title={t("When")}>
            <FieldBox>{storyTrigger || t("No trigger selected")}</FieldBox>
          </Summary>
        )}
        {type === "DIRECT" && (
          <Summary title={t("When")}>
            <FieldBox>{t("Someone sends you a direct message")}</FieldBox>
          </Summary>
        )}

        {isComments && (
        <Summary title={t("When someone comments on")}>
          <div className="flex items-center gap-3">
            {postThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={postThumb}
                alt={t("Post")}
                className="h-14 w-14 rounded object-cover"
              />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded bg-surface-hover text-[10px] text-muted">
                {campaign.matchAnyPost || campaign.pendingNextReel ? "Any" : t("Post")}
              </div>
            )}
            <span className="text-sm text-foreground">{trigger}</span>
          </div>
        </Summary>
        )}

        <Summary title={isComments ? t("And this comment has") : t("Keyword")}>
          <FieldBox>{matchText}</FieldBox>
          {!isComments && campaign.matchAnyWord && (
            <p className="text-xs text-muted">
              {t("At most one automatic reply per person every {hours} h, and none while your team is talking to them.", {
                hours: campaign.replyCooldownHours ?? 24,
              })}
            </p>
          )}
          {isComments && campaign.publicReplyEnabled && publicReplies.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted">{t("Public reply under the post")}</p>
              {publicReplies.map((m, i) => (
                <FieldBox key={i}>{m}</FieldBox>
              ))}
            </div>
          )}
        </Summary>

        {isComments && campaign.openingDmEnabled && (
          <Summary title={t("They will get an opening DM")}>
            <FieldBox>{campaign.openingDmMessage || t("Opening message")}</FieldBox>
            <FieldBox>{campaign.openingDmButtonLabel || t("Button")}</FieldBox>
          </Summary>
        )}

        {campaign.requireFollow && (
          <Summary title={t("They must follow first")}>
            <FieldBox>
              {campaign.followPromptMessage ||
                "quick favor before i send your link. i don't make any money from this, it's free. if you want to support me, just don't unfollow after, and star the repo on github if it helps you. tap the button once you're following and i'll send it over"}
            </FieldBox>
            <FieldBox>
              {campaign.followPromptButtonLabel || "i'm following"}
            </FieldBox>
            <MediaThumbs items={mediaBySlot.FOLLOW_PROMPT} />
          </Summary>
        )}

        <Summary title={t("And then, they will get a DM")}>
          <FieldBox>{campaign.dmMessage}</FieldBox>
          {hasLink && (
            <FieldBox>{campaign.linkButtonLabel || "Open link"}</FieldBox>
          )}
          {hasSecondLink && (
            <FieldBox>
              {campaign.trackedLinks?.[1]?.label || "Open link"}
            </FieldBox>
          )}
          <MediaThumbs items={mediaBySlot.MAIN} />
        </Summary>

        {hasLink && (
          <Summary title={t("The exact link sent")}>
            {campaign.trackedLinks
              ?.filter((link) => link.destinationUrl)
              .map((link, i) => (
                <div key={i} className="space-y-1">
                  <div className="rounded border border-border bg-surface px-3 py-2">
                    <p className="select-all break-all font-mono text-xs text-foreground">
                      {link.trackedUrl ?? link.destinationUrl}
                    </p>
                  </div>
                  <p className="text-xs text-muted">
                    {link.label ? `${link.label} · ` : ""}{t("redirects to")}{" "}
                    <span className="break-all">{link.destinationUrl}</span>
                  </p>
                </div>
              ))}
          </Summary>
        )}

        {campaign.followUpEnabled && campaign.followUpMessage && (
          <Summary title={t("Then a follow-up message")}>
            <FieldBox>{campaign.followUpMessage}</FieldBox>
            <p className="text-xs text-muted">
              {campaign.followUpDelayMinutes && campaign.followUpDelayMinutes > 0
                ? t("Sent {minutes} min after the link.", { minutes: campaign.followUpDelayMinutes })
                : t("Sent right after the link.")}
            </p>
            <MediaThumbs items={mediaBySlot.FOLLOW_UP} />
          </Summary>
        )}
      </div>

      {/* Right: top bar + tabs */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 border-b border-border pb-3">
          <div className="flex gap-4">
            <TabButton active={tab === "insights"} onClick={() => setTab("insights")}>
              {t("Insights")}
            </TabButton>
            <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
              {t("Preview")}
            </TabButton>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/campaigns/${campaign.id}/edit`}
              className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
            >
              {t("Edit")}
            </Link>
            <button
              onClick={toggleActive}
              disabled={busy}
              className={`rounded border px-3 py-1.5 text-sm disabled:opacity-50 ${
                campaign.isActive
                  ? "border-error/30 text-error hover:bg-error/10"
                  : "border-success/30 text-success hover:bg-success/10"
              }`}
            >
              {campaign.isActive ? t("Stop") : t("Resume")}
            </button>
          </div>
        </div>

        {tab === "insights" && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className="panel rounded p-4">
                <p className="text-sm text-muted">{m.label}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {tab === "preview" && (
          <div className="flex justify-center sm:justify-start">
          <CampaignPreview
            tab={previewTab}
            onTabChange={setPreviewTab}
            username={campaign.instagramAccount.username}
            avatarUrl={avatarUrl}
            postThumb={postThumb}
            caption=""
            sampleComment={campaign.matchAnyWord ? t("nice!") : campaign.keywords[0] ?? "LINK"}
            automationType={type}
            storyMode={campaign.triggerStoryReplies || !campaign.matchAnyWord ? "reply" : "mention"}
            media={mediaBySlot}
            publicReplyEnabled={isComments && campaign.publicReplyEnabled}
            publicReplyMessage={publicReplies[0] ?? ""}
            openingDmEnabled={isComments && campaign.openingDmEnabled}
            openingDmMessage={campaign.openingDmMessage ?? ""}
            openingDmButtonLabel={campaign.openingDmButtonLabel ?? ""}
            revealMessage={campaign.dmMessage}
            hasLink={hasLink}
            linkButtonLabel={campaign.linkButtonLabel ?? "Open link"}
            linkUrl={
              campaign.trackedLinks?.[0]?.trackedUrl ??
              campaign.trackedLinks?.[0]?.destinationUrl
            }
            hasSecondLink={hasSecondLink}
            secondLinkButtonLabel={
              campaign.trackedLinks?.[1]?.label ?? "Open link"
            }
            requireFollow={campaign.requireFollow}
            followPromptMessage={campaign.followPromptMessage ?? ""}
            followPromptButtonLabel={
              campaign.followPromptButtonLabel ?? "i'm following"
            }
            followUpEnabled={campaign.followUpEnabled ?? false}
            followUpMessage={campaign.followUpMessage ?? ""}
            followUpDelayMinutes={campaign.followUpDelayMinutes ?? 0}
          />
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

function FieldBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-surface px-3 py-2 text-sm text-foreground">
      {children}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 pb-2 text-sm font-medium ${
        active
          ? "border-accent text-foreground"
          : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function MediaThumbs({ items }: { items: PreviewMedia[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((m, i) =>
        m.kind === "VIDEO" ? (
          <video key={i} src={m.url} muted playsInline preload="metadata" className="h-16 w-12 rounded object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={m.url} alt="" className="h-16 w-12 rounded object-cover" />
        )
      )}
    </div>
  );
}

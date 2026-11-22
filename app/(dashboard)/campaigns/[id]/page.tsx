"use client";

/**
 * Campaign Detail
 *
 * Clicking a campaign opens this read-only view: "How it works" on top, what
 * the automation does on the left, and Insights / Preview tabs on the right.
 * Edit and Stop/Resume sit next to the title.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import CampaignPreview, { type PreviewMedia, type PreviewTab } from "@/components/campaign-preview";
import { automationSummary } from "@/lib/automation/summary";
import { automationTypeSlug } from "@/lib/automation/type-slugs";
import HowItWorks from "@/components/how-it-works";
import { Button, ButtonLink } from "@/components/ui/button";
import { KeywordChip } from "@/components/ui/chip";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatusDot } from "@/components/ui/status";

type AutomationType = "COMMENTS" | "STORIES" | "DIRECT";
type Slot = "FOLLOW_PROMPT" | "MAIN" | "FOLLOW_UP";

interface Campaign {
  id: string;
  name: string;
  postId: string | null;
  postUrl: string | null;
  postIds?: string[];
  posts?: Array<{ postId: string; postUrl: string | null }>;
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
  // postId → current thumbnail (Instagram URLs expire, so never stored).
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
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

    // Thumbnails of the marked posts found among the 50 most recent; older
    // ones are shown as links.
    if (campaign.postIds?.length || campaign.postId) {
      fetch(`/api/instagram/posts?instagramAccountId=${acct}&limit=50`)
        .then((r) => r.json())
        .then((payload) => {
          if (!payload.success) return;
          const map: Record<string, string> = {};
          for (const p of payload.data as { id: string; media_type?: string; thumbnail_url?: string; media_url?: string }[]) {
            const url = p.media_type === "VIDEO" ? p.thumbnail_url : p.media_url ?? p.thumbnail_url;
            if (url) map[p.id] = url;
          }
          setThumbs(map);
        })
        .catch(() => setThumbs({}));
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
    return (
      <div className="space-y-5" aria-busy="true">
        <div className="h-16 max-w-md rounded-card bg-surface" />
        <div className="card h-24" />
        <div className="card h-64" />
      </div>
    );
  }
  if (notFound || !campaign) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-muted">{t("Campaign not found.")}</p>
        <Button onClick={() => router.push("/automations")} className="mt-4" icon="arrowLeft">
          {t("Back to automations")}
        </Button>
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
  const markedPosts = campaign.posts?.length
    ? campaign.posts
    : campaign.postId
      ? [{ postId: campaign.postId, postUrl: campaign.postUrl }]
      : [];
  const postThumb = markedPosts[0] ? thumbs[markedPosts[0].postId] ?? null : null;
  const trigger = campaign.matchAnyPost
    ? t("All posts and reels")
    : campaign.pendingNextReel
      ? t("Your next reel")
      : markedPosts.length > 1
        ? t("{count} checked posts and reels", { count: markedPosts.length })
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
      postCount: markedPosts.length,
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
    <div className="space-y-6">
      {/* Header: breadcrumb, name, status and the actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-[13px] text-faint">
            <Link href={`/automations?tipo=${automationTypeSlug(type)}`} className="rounded-sm text-accent-fg hover:text-accent-fg-hover">
              {t("Automations")}
            </Link>{" "}
            / {typeLabel}
          </p>
          <h1 className="title-page break-words">{campaign.name}</h1>
          <StatusDot tone={campaign.isActive ? "success" : "neutral"} className="mt-2">
            {campaign.isActive ? t("LIVE") : t("Paused")}
          </StatusDot>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button onClick={toggleActive} disabled={busy} icon={campaign.isActive ? "pause" : "play"}>
            {campaign.isActive ? t("Stop") : t("Resume")}
          </Button>
          <ButtonLink href={`/campaigns/${campaign.id}/edit`} variant="primary" icon="edit">
            {t("Edit")}
          </ButtonLink>
        </div>
      </div>

      <HowItWorks summary={summary} />

      <div className="grid items-start gap-[22px] lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Left: what the automation does */}
      <div className="card min-w-0 space-y-5 p-5">
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
          <p className="text-foreground">{trigger}</p>
          {markedPosts.length > 0 && !campaign.matchAnyPost && (
            <ul className="flex flex-wrap gap-2" aria-label={t("Posts and reels")}>
              {markedPosts.slice(0, 12).map((p, i) => (
                <li key={p.postId}>
                  <a
                    href={p.postUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="grid aspect-[4/5] w-14 place-items-center overflow-hidden rounded-item bg-switch-off px-1 text-center text-[10px] leading-tight text-muted"
                    title={p.postUrl ?? undefined}
                  >
                    {thumbs[p.postId] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbs[p.postId]} alt={t("Post {number}", { number: i + 1 })} className="h-full w-full object-cover" />
                    ) : (
                      t("Post {number}", { number: i + 1 })
                    )}
                  </a>
                </li>
              ))}
              {markedPosts.length > 12 && (
                <li className="grid aspect-[4/5] w-14 place-items-center rounded-item bg-switch-off text-xs text-muted">+{markedPosts.length - 12}</li>
              )}
            </ul>
          )}
        </Summary>
        )}

        <Summary title={isComments ? t("And this comment has") : t("Keyword")}>
          {campaign.matchAnyWord || campaign.keywords.length === 0 ? (
            <FieldBox>{matchText}</FieldBox>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {campaign.keywords.map((kw) => (
                <KeywordChip key={kw} size="md">
                  {kw}
                </KeywordChip>
              ))}
            </div>
          )}
          {!isComments && campaign.matchAnyWord && (
            <p className="hint">
              {t("At most one automatic reply per person every {hours} h, and none while your team is talking to them.", {
                hours: campaign.replyCooldownHours ?? 24,
              })}
            </p>
          )}
          {isComments && campaign.publicReplyEnabled && publicReplies.length > 0 && (
            <div className="space-y-1.5">
              <p className="hint">{t("Public reply under the post")}</p>
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
                  <div className="rounded-item border border-border-subtle bg-surface px-3 py-2">
                    <p className="select-all break-all font-mono text-[13px] text-foreground">
                      {link.trackedUrl ?? link.destinationUrl}
                    </p>
                  </div>
                  <p className="hint">
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
            <p className="hint">
              {campaign.followUpDelayMinutes && campaign.followUpDelayMinutes > 0
                ? t("Sent {minutes} min after the link.", { minutes: campaign.followUpDelayMinutes })
                : t("Sent right after the link.")}
            </p>
            <MediaThumbs items={mediaBySlot.FOLLOW_UP} />
          </Summary>
        )}
      </div>

      {/* Right: numbers and preview */}
      <div className="min-w-0 space-y-4 lg:sticky lg:top-6">
        <SegmentedControl
          kind="tabs"
          label={t("Automation details")}
          value={tab}
          onChange={setTab}
          items={[
            { value: "insights", label: t("Insights"), icon: "diagnostics" },
            { value: "preview", label: t("Preview"), icon: "eye" },
          ]}
        />

        {tab === "insights" && (
          <dl className="grid grid-cols-2 gap-3">
            {metrics.map((m) => (
              <div key={m.label} className="card flex flex-col-reverse gap-1 p-4">
                <dt className="text-[13px] text-muted">{m.label}</dt>
                <dd className="font-display text-[28px] font-semibold leading-none text-heading">{m.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {tab === "preview" && (
          <div>
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
    </div>
  );
}

function Summary({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="font-semibold text-heading">{title}</h2>
      {children}
    </div>
  );
}

function FieldBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="whitespace-pre-wrap rounded-item border border-border-subtle bg-surface px-3 py-2.5 text-foreground">
      {children}
    </div>
  );
}

function MediaThumbs({ items }: { items: PreviewMedia[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((m, i) =>
        m.kind === "VIDEO" ? (
          <video key={i} src={m.url} muted playsInline preload="metadata" className="aspect-[4/5] w-16 rounded-item object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={m.url} alt="" className="aspect-[4/5] w-16 rounded-item object-cover" />
        )
      )}
    </div>
  );
}

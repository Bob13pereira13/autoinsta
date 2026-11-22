"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * "Direct preview": the conversation the person gets, in chat bubbles — the
 * messages configured in the editor, their buttons and the images/videos of
 * each step. Comments automations add a "Direct | Comment" switch: Comment
 * shows the comment and the public reply under it.
 */

import { useI18n } from "@/lib/i18n/provider";
import { SegmentedControl } from "@/components/ui/segmented";
import { cx } from "@/components/ui/cx";

export type PreviewTab = "post" | "comments" | "dm" | "conversation";

export type PreviewMedia = { kind: "IMAGE" | "VIDEO"; url: string };
export type PreviewMediaBySlot = Partial<Record<"FOLLOW_PROMPT" | "MAIN" | "FOLLOW_UP", PreviewMedia[]>>;

interface CampaignPreviewProps {
  tab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
  username: string;
  avatarUrl: string | null;
  postThumb: string | null;
  caption: string;
  sampleComment: string;
  // Comments: comment → DM. Stories and Direct: a single conversation that
  // starts with the person's message (no opening DM, no public reply).
  automationType: "COMMENTS" | "STORIES" | "DIRECT";
  // Stories: what the person did.
  storyMode?: "reply" | "mention";
  media?: PreviewMediaBySlot;
  publicReplyEnabled: boolean;
  publicReplyMessage: string;
  openingDmEnabled: boolean;
  openingDmMessage: string;
  openingDmButtonLabel: string;
  revealMessage: string;
  hasLink: boolean;
  linkButtonLabel: string;
  linkUrl?: string;
  hasSecondLink: boolean;
  secondLinkButtonLabel: string;
  requireFollow: boolean;
  followPromptMessage: string;
  followPromptButtonLabel: string;
  followUpEnabled: boolean;
  followUpMessage: string;
  followUpDelayMinutes?: number;
}

const SAMPLE_USER = "username";

function Avatar({ url, size = 28 }: { url: string | null; size?: number }) {
  return url ? (
    <img src={url} alt="" referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden="true" className="shrink-0 rounded-full bg-gradient-accent" style={{ width: size, height: size }} />
  );
}

/** The business's message (left). Buttons appear as outlined pills under it. */
function Incoming({ children, buttons = [] }: { children?: React.ReactNode; buttons?: string[] }) {
  return (
    <div className="flex max-w-[88%] flex-col items-start gap-1.5 self-start">
      {children !== undefined && children !== null && children !== "" && (
        <div className="whitespace-pre-wrap rounded-[16px_16px_16px_4px] bg-bubble-in px-3 py-2.5 leading-[1.45] text-foreground">{children}</div>
      )}
      {buttons.map((label, i) => (
        <span key={i} className="rounded-full border border-accent-soft-border px-3.5 py-2 text-[13px] font-semibold text-accent-soft-fg">
          {label}
        </span>
      ))}
    </div>
  );
}

/** The person's tap or message (right), with the brand gradient. */
function Outgoing({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[80%] self-end rounded-[16px_16px_4px_16px] bg-gradient-accent px-3 py-2 text-[13px] text-on-accent">{children}</div>;
}

function MediaBubbles({ items }: { items?: PreviewMedia[] }) {
  if (!items?.length) return null;
  return (
    <div className="flex max-w-[88%] flex-wrap gap-1.5 self-start">
      {items.map((item, i) =>
        item.kind === "VIDEO" ? (
          <div key={i} className="relative aspect-[4/5] w-28 overflow-hidden rounded-[16px] bg-scrim">
            <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            <span className="absolute inset-0 grid place-items-center text-lg text-on-scrim" aria-hidden="true">
              ▶
            </span>
          </div>
        ) : (
          <img key={i} src={item.url} alt="" className="aspect-[4/5] w-28 rounded-[16px] object-cover" />
        )
      )}
    </div>
  );
}

function renderMessage(text: string, hasLink: boolean, linkUrl: string | undefined, linkPlaceholder: string) {
  const withName = text.replace(/\{username\}/g, SAMPLE_USER);
  return withName.split(/(\{link\})/g).map((part, i) =>
    part === "{link}" ? (
      <span key={i} className={linkUrl || hasLink ? "break-all text-accent-fg underline" : "italic text-faint"}>
        {/* Show the actual link being sent, not a placeholder token. */}
        {linkUrl || (hasLink ? linkPlaceholder : "{link}")}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function Conversation(props: CampaignPreviewProps & { inbound?: React.ReactNode; opening: boolean }) {
  const { t } = useI18n();
  const resolved = props.revealMessage.replace(/\{username\}/g, SAMPLE_USER);
  const showCard = props.hasLink && resolved.includes("{link}");
  const bodyText = showCard ? resolved.replace(/\s*\{link\}\s*/g, " ").trim() : resolved;
  const linkButtons = showCard
    ? [props.linkButtonLabel || "Open link", ...(props.hasSecondLink ? [props.secondLinkButtonLabel || "Open link"] : [])]
    : [];
  return (
    <div className="flex flex-col gap-2.5">
      {props.inbound !== undefined && <Outgoing>{props.inbound}</Outgoing>}
      {props.opening && (
        <>
          <Incoming buttons={[props.openingDmButtonLabel || t("Button label")]}>{props.openingDmMessage || t("Your opening message…")}</Incoming>
          <Outgoing>{props.openingDmButtonLabel || t("Button label")}</Outgoing>
        </>
      )}
      {props.requireFollow && (
        <>
          <Incoming buttons={[props.followPromptButtonLabel || "i'm following"]}>
            {props.followPromptMessage ||
              "quick favor before i send your link. i don't make any money from this, it's free. if you want to support me, just don't unfollow after, and star the repo on github if it helps you. tap the button once you're following and i'll send it over"}
          </Incoming>
          <Outgoing>{props.followPromptButtonLabel || "i'm following"}</Outgoing>
          <MediaBubbles items={props.media?.FOLLOW_PROMPT} />
        </>
      )}
      <Incoming buttons={linkButtons}>
        {!props.revealMessage
          ? t("Write a message")
          : showCard
            ? bodyText || null
            : renderMessage(props.revealMessage, props.hasLink, props.linkUrl, t("your link"))}
      </Incoming>
      <MediaBubbles items={props.media?.MAIN} />
      {props.followUpEnabled && (
        <>
          {(props.followUpDelayMinutes ?? 0) > 0 && (
            <p className="py-0.5 text-center text-[11px] text-faint">
              {props.followUpDelayMinutes} {t("min later")}
            </p>
          )}
          <Incoming>
            {props.followUpMessage.trim()
              ? props.followUpMessage.replace(/\{username\}/g, SAMPLE_USER)
              : t("Btw just wanted to say thanks for following me, I appreciate the support 🙌")}
          </Incoming>
          <MediaBubbles items={props.media?.FOLLOW_UP} />
        </>
      )}
    </div>
  );
}

function CommentThread(props: CampaignPreviewProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      {props.postThumb && <img src={props.postThumb} alt="" className="aspect-[4/5] w-24 rounded-control object-cover" />}
      <div className="flex gap-2.5">
        <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-full bg-switch-off" />
        <div className="min-w-0 flex-1">
          <p className="text-xs">
            <span className="font-semibold text-heading">{SAMPLE_USER}</span> <span className="text-faint">{t("Now")}</span>
          </p>
          <p className="text-foreground">{props.sampleComment || "yc"}</p>
          <p className="mt-0.5 text-xs text-faint">{t("Reply")}</p>
        </div>
      </div>
      {props.publicReplyEnabled && (
        <div className="flex gap-2.5 pl-10">
          <Avatar url={props.avatarUrl} size={28} />
          <div className="min-w-0 flex-1">
            <p className="text-xs">
              <span className="font-semibold text-heading">{props.username}</span> <span className="text-faint">{t("Now")}</span>
            </p>
            <p className="text-foreground">{props.publicReplyMessage || t("Sent you a DM! 📩")}</p>
            <p className="mt-0.5 text-xs text-faint">{t("Reply")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CampaignPreview(props: CampaignPreviewProps) {
  const { t } = useI18n();
  const isComments = props.automationType === "COMMENTS";
  // Comments: "Direct" (the DM) or "Comment" (the public side). The old
  // "post" tab now opens on the DM.
  const view: "dm" | "comments" = isComments && props.tab === "comments" ? "comments" : "dm";

  const inbound =
    props.automationType === "STORIES" ? (
      <span className="block">
        <span className="mb-1 block text-[11px] opacity-90">
          {props.storyMode === "mention" ? t("Mentioned you in their story") : t("Replied to your story")}
        </span>
        {props.storyMode === "mention" ? (
          <span className="block h-16 w-12 rounded-md bg-on-accent/25" aria-hidden="true" />
        ) : (
          props.sampleComment || t("their message")
        )}
      </span>
    ) : (
      props.sampleComment || t("their message")
    );

  return (
    <aside
      aria-label={t("Direct preview")}
      className="flex w-full flex-col gap-3 rounded-[28px] border border-preview-border bg-preview px-4 pb-5 pt-[18px] text-sm shadow-preview"
    >
      <div className="flex items-center gap-2.5 border-b border-border-subtle pb-3">
        <Avatar url={props.avatarUrl} size={32} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-heading">{props.username}</p>
          <p className="text-xs text-faint">{t("Direct preview")}</p>
        </div>
      </div>
      {isComments && (
        <SegmentedControl
          size="sm"
          kind="tabs"
          label={t("Preview")}
          value={view}
          onChange={(next) => props.onTabChange(next)}
          items={[
            { value: "dm", label: t("Direct") },
            { value: "comments", label: t("Comment") },
          ]}
          className="self-start"
        />
      )}
      <div className={cx("min-h-[200px]")}>
        {view === "comments" ? (
          <CommentThread {...props} />
        ) : isComments ? (
          <Conversation {...props} opening={props.openingDmEnabled} />
        ) : (
          // The person opened the conversation, so no opening DM is sent.
          <Conversation {...props} opening={false} inbound={inbound} />
        )}
      </div>
    </aside>
  );
}

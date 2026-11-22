"use client";

/**
 * The automation editor's help and warnings, next to the field they concern.
 * - Hint: a short help line, always visible (no "?" hiding anything).
 * - FieldNotes: the warnings of one field (lib/automation/editor-warnings.ts),
 *   yellow (heads-up), red (high risk) or red marked "fix to save" (blocks the
 *   save). They show only while their condition holds.
 * - Counter: how much room a message has left, as Instagram counts it.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { Alert } from "@/components/ui/alert";
import type { EditorWarning, WarningField } from "@/lib/automation/editor-warnings";
import { limitState, type MessageLimit } from "@/lib/automation/message-limits";
import type { Conflict } from "@/lib/automation/conflicts";
import { cx } from "@/components/ui/cx";

const LINK = { link: "{link}" };

export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("hint leading-relaxed", className)}>{children}</p>;
}

/** One note. "error" also says it has to be fixed before saving. */
export function Note({
  tone,
  children,
  action,
  id,
}: {
  tone: EditorWarning["tone"];
  children: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  const { t } = useI18n();
  return (
    <div data-note={id} data-tone={tone}>
      <Alert tone={tone === "warning" ? "warning" : "error"} role="status" action={action} title={tone === "error" ? t("Fix to save") : undefined}>
        {children}
      </Alert>
    </div>
  );
}

/** The text of each editor warning. */
export function useWarningText() {
  const { t } = useI18n();
  return function warningText(w: EditorWarning, ctx: { anyLabel: string }): ReactNode {
    const word = w.word ?? "";
    switch (w.id) {
      case "postScopeEmpty":
        return t("Check at least one post");
      case "storyNone":
        return t("Choose at least one: story replies or story mentions");
      case "storyMentionsNeedAny":
        return t("Story mentions have no text, so they only work without keywords");
      case "storyMentionsWithKeyword":
        return t("Story mentions have no text, so they only work without keywords. Choose “Any reply” in step 2.");
      case "keywordMissing":
        return t("Add at least one keyword, or choose “{any}”.", { any: ctx.anyLabel });
      case "keywordTooMany":
        return t("Up to 10 keywords.");
      case "keywordTooLong":
        return t("“{word}” is too long: up to 50 characters per keyword.", { word });
      case "keywordDuplicate":
        return t("“{word}” is repeated (case and accents don't count). Remove one.", { word });
      case "keywordShort":
        return t("“{word}” is very short and shows up in many comments by accident. Prefer something more specific.", { word });
      case "keywordShortPartial":
        return t("With “part of a word” on, “{word}” also catches it inside other words: almost every comment. Turn it off or use a longer word.", { word });
      case "keywordCommon":
        return t("“{word}” is very common: almost every comment has it. Use something more specific, like LINK.", { word });
      case "allPostsAnyComment":
        return (
          <>
            <span className="font-semibold">{t("Careful: this sends a DM to everyone who comments on any of your posts")}</span>{" "}
            {t("Every comment on every post and reel gets the automatic reply. To limit it, choose “Specific posts” in step 1 or “With a keyword” in step 2.")}
          </>
        );
      case "directAny":
        return (
          <>
            <span className="font-semibold">{t("Careful: this answers EVERY direct message")}</span>{" "}
            {t("Including customers who already talk to your team. To avoid spam, each person gets at most one automatic reply per interval below, and nothing is sent while someone from your team is talking to them (24 h after their last message).")}
          </>
        );
      case "openingIncomplete":
        return t("Your opening DM needs a message and a button label.");
      case "openingLinkToken":
        return t("{link} does not work in the opening DM: the person would see “{link}”. The link goes in the main message.", LINK);
      case "followWithoutOpening":
        return t("Without the opening DM, everyone gets the request, even people who already follow: Instagram only tells who follows after a tap on the button.");
      case "followLinkToken":
        return t("{link} is removed here: the link only goes after the person follows.", LINK);
      case "mainMissing":
        return t("Add the DM with the link.");
      case "mainTokenWithoutLink":
        return t("Your message has {link} but no link is set: the person would see “{link}”. Add the link or remove {link}.", LINK);
      case "mainLinkWithoutToken":
        return t("Without {link} in the text, the link only goes in the button. If Instagram doesn't accept the button, the message arrives without the link. Put {link} at the end of the text.", LINK);
      case "labelTooLong":
        return t("Button labels can have up to 20 characters");
      case "textNearLimit":
        return t("Close to Instagram's limit.");
      case "textOverLimit":
        return w.limit?.unit === "bytes"
          ? t("Instagram takes up to 1000 bytes of text, and accents and emojis take more space. Shorten the message.")
          : t("With a button, Instagram takes up to 640 characters of text. Shorten the text.");
      case "mediaWithoutOpening":
        return t("In Comments, images and videos are only sent after the person taps the opening DM button. Turn on the opening DM or remove the media.");
      case "followUpWithoutButton":
        return t("In Comments, the thank-you only goes after the person taps a button. Turn on the opening DM or “follow me to unlock”.");
      case "followUpLate":
        return t("Instagram only allows replies up to 24 h after the person's last message; with this delay the thank-you may not go.");
      case "followUpLinkToken":
        return t("{link} is removed here.", LINK);
      case "publicReplySingle":
        return t("With a single variation, every comment gets the same reply and it looks automatic. Add at least one more.");
      case "publicReplyLink":
        return t("A link in a comment isn't clickable. Keep the link for the DM.");
    }
  };
}

/** The warnings of one field (none = nothing rendered). */
export function FieldNotes({ warnings, field, anyLabel }: { warnings: EditorWarning[]; field: WarningField; anyLabel: string }) {
  const text = useWarningText();
  const mine = warnings.filter((w) => w.field === field && w.id !== "textNearLimit");
  if (!mine.length) return null;
  return (
    <div className="space-y-2">
      {mine.map((w, i) => (
        <Note key={`${w.id}-${w.word ?? ""}-${i}`} tone={w.tone} id={w.id}>
          {text(w, { anyLabel })}
        </Note>
      ))}
    </div>
  );
}

/** Room left in a message. Bytes for plain text (accents and emojis take more), characters above a button. */
export function Counter({ limit }: { limit: MessageLimit }) {
  const { t } = useI18n();
  const state = limitState(limit);
  const left = limit.max - limit.used;
  const tone = state === "over" ? "text-error" : state === "near" ? "text-warning" : "text-faint";
  const amount =
    limit.unit === "bytes"
      ? left >= 0
        ? t("{count} left", { count: left })
        : t("{count} over the limit", { count: -left })
      : left >= 0
        ? t("{count} characters left", { count: left })
        : t("{count} characters over the limit", { count: -left });
  return (
    <p className={cx("text-right text-xs", tone)} data-counter={limit.unit} aria-live="polite">
      {state === "near" && <span className="font-semibold">{t("Close to Instagram's limit.")} </span>}
      {amount}
      {limit.unit === "bytes" && <span className="text-faint"> · {t("Accents and emojis take more space.")}</span>}
    </p>
  );
}

/** What two automations both catch, in words. */
export function useConflictWhat() {
  const { t } = useI18n();
  return (c: Pick<Conflict, "where" | "keyword">): string => {
    const k = c.keyword;
    switch (c.where) {
      case "allPosts":
        return k ? t("comments with “{keyword}” on all posts", { keyword: k }) : t("any comment on all posts");
      case "samePost":
        return k ? t("comments with “{keyword}” on the same post", { keyword: k }) : t("any comment on the same post");
      case "nextReel":
        return k ? t("comments with “{keyword}” on the next reel", { keyword: k }) : t("any comment on the next reel");
      case "storyReplies":
        return k ? t("story replies with “{keyword}”", { keyword: k }) : t("any story reply");
      case "storyMentions":
        return t("story mentions");
      case "direct":
        return k ? t("messages with “{keyword}”", { keyword: k }) : t("any message");
    }
  };
}

export function useConflictText() {
  const { t } = useI18n();
  const what = useConflictWhat();
  return (c: Conflict): string => {
    const reason = c.reason === "keyword" ? t("it has a keyword") : c.reason === "specific" ? t("it is on specific posts") : t("it is older");
    const values = { name: c.other.name, what: what(c), reason };
    if (c.never) {
      return t("This automation won't answer anything: “{name}” takes everything it would answer ({what}), because {reason}. Change the keyword or pause one of them.", values);
    }
    return c.winner === "other"
      ? t("Conflict with “{name}” ({what}): “{name}” answers instead of this one, because {reason}. Change the keyword or pause one of them.", values)
      : t("Conflict with “{name}” ({what}): this one answers instead of “{name}”, because {reason}. Change the keyword or pause one of them.", values);
  };
}

/** The live conflicts of the automation being edited. */
export function ConflictNotes({ conflicts }: { conflicts: Conflict[] }) {
  const { t } = useI18n();
  const text = useConflictText();
  if (!conflicts.length) return null;
  return (
    <div className="space-y-2">
      {conflicts.map((c) => (
        <Note
          key={c.other.id}
          tone={c.never ? "danger" : "warning"}
          id="conflict"
          action={
            <Link href={`/campaigns/${c.other.id}`} className="whitespace-nowrap font-semibold underline underline-offset-4">
              {t("Open “{name}”", { name: c.other.name })}
            </Link>
          }
        >
          {text(c)}
        </Note>
      ))}
    </div>
  );
}

/** The chosen account cannot answer: turned off or disconnected. */
export function AccountNote({ problem, username }: { problem: "off" | "reconnect" | null; username: string }) {
  const { t } = useI18n();
  if (!problem) return null;
  return (
    <Note
      tone={problem === "reconnect" ? "danger" : "warning"}
      id={problem === "reconnect" ? "accountReconnect" : "accountOff"}
      action={
        <Link href="/accounts" className="whitespace-nowrap font-semibold underline underline-offset-4">
          {problem === "reconnect" ? t("Reconnect in Accounts") : t("Open Accounts")}
        </Link>
      }
    >
      {problem === "reconnect"
        ? t("@{username}'s connection to Instagram expired. This automation won't answer until you reconnect.", { username })
        : t("@{username} is turned off in Accounts. This automation won't answer until you turn the account back on.", { username })}
    </Note>
  );
}

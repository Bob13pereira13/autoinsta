/**
 * The words of the overlap notes (lib/automation/conflicts.ts), in the
 * interface's language. Pure, so the editor, the save dialog, the automations
 * list and the tests all say the same thing.
 *
 * - A split is an information note: which comments or messages go to which
 *   automation. No "conflict", nothing to fix.
 * - A conflict is a warning: one of the two stops answering; change the
 *   keyword or pause one.
 */
import type { I18n } from "@/lib/i18n";
import { kindOf, type Conflict } from "./conflicts";

type Text = Pick<I18n, "t" | "locale">;
type Channel = "comments" | "stories" | "direct";

const LISTED = 3;

function channelOf(where: Conflict["where"]): Channel {
  if (where === "storyReplies" || where === "storyMentions") return "stories";
  if (where === "direct") return "direct";
  return "comments";
}

/** The words both catch, quoted: “link”, “preço” or “cupom” (then “or 2 other keywords”). */
export function keywordList(words: string[], { t, locale }: Text): string {
  const quoted = words.slice(0, LISTED).map((word) => `“${word}”`);
  const rest = words.length - LISTED;
  if (rest > 0) quoted.push(rest === 1 ? t("1 other keyword") : t("{count} other keywords", { count: rest }));
  return new Intl.ListFormat(locale, { type: "disjunction" }).format(quoted);
}

/** Every word both catch; older saves may only have the first one. */
function wordsOf(c: Pick<Conflict, "keyword" | "keywords">): string[] {
  return c.keywords?.length ? c.keywords : c.keyword ? [c.keyword] : [];
}

/** What two automations both catch, in words (for the warnings). */
export function conflictWhat(c: Pick<Conflict, "where" | "keyword" | "keywords">, i18n: Text): string {
  const { t } = i18n;
  const words = wordsOf(c);
  const keywords = keywordList(words, i18n);
  const k = words.length > 0;
  switch (c.where) {
    case "allPosts":
      return k ? t("comments with {keywords} on all posts", { keywords }) : t("any comment on all posts");
    case "samePost":
      return k ? t("comments with {keywords} on the same post", { keywords }) : t("any comment on the same post");
    case "nextReel":
      return k ? t("comments with {keywords} on the next reel", { keywords }) : t("any comment on the next reel");
    case "storyReplies":
      return k ? t("story replies with {keywords}", { keywords }) : t("any story reply");
    case "storyMentions":
      return t("story mentions");
    case "direct":
      return k ? t("messages with {keywords}", { keywords }) : t("any message");
  }
}

/** The information note of a split: which part goes to which automation. */
export function splitText(c: Conflict, i18n: Text): string {
  const { t } = i18n;
  const name = c.other.name;
  const words = wordsOf(c);
  const keywords = keywordList(words, i18n);
  const mine = c.winner === "this";
  const channel = channelOf(c.where);

  if (channel === "stories") {
    return mine
      ? t("Story replies with {keywords} go to this automation. The others still go to “{name}”.", { keywords, name })
      : t("Story replies with {keywords} go to “{name}”; this one answers the others.", { keywords, name });
  }
  if (channel === "direct") {
    return mine
      ? t("Messages with {keywords} go to this automation. The others still go to “{name}”.", { keywords, name })
      : t("Messages with {keywords} go to “{name}”; this one answers the others.", { keywords, name });
  }

  // Comments: where the one that answers listens, when it is not every post.
  const scope = c.winnerScope ?? "all";
  const any = words.length === 0;
  if (scope === "nextReel") {
    if (any) {
      return mine
        ? t("On the next reel, comments go to this automation. On the other posts, they still go to “{name}”.", { name })
        : t("On the next reel, comments go to “{name}”; this one answers on the other posts.", { name });
    }
    return mine
      ? t("On the next reel, comments with {keywords} go to this automation. The others still go to “{name}”.", { keywords, name })
      : t("On the next reel, comments with {keywords} go to “{name}”; this one answers the others.", { keywords, name });
  }
  if (scope === "posts") {
    if (any) {
      return mine
        ? t("On the posts checked here, comments go to this automation. On the other posts, they still go to “{name}”.", { name })
        : t("On the posts checked in “{name}”, comments go to “{name}”; this one answers on the other posts.", { name });
    }
    return mine
      ? t("On the posts checked here, comments with {keywords} go to this automation. The others still go to “{name}”.", { keywords, name })
      : t("On the posts checked in “{name}”, comments with {keywords} go to “{name}”; this one answers the others.", { keywords, name });
  }
  return mine
    ? t("Comments with {keywords} go to this automation. The others still go to “{name}”.", { keywords, name })
    : t("Comments with {keywords} go to “{name}”; this one answers the others.", { keywords, name });
}

/** The warning of a conflict: one of the two stops answering. */
export function conflictWarningText(c: Conflict, i18n: Text): string {
  const { t } = i18n;
  const reason = c.reason === "keyword" ? t("it has a keyword") : c.reason === "specific" ? t("it is on specific posts") : t("it is older");
  const values = { name: c.other.name, what: conflictWhat(c, i18n), reason };
  if (c.never) {
    return t("This automation won't answer anything: “{name}” takes everything it would answer ({what}), because {reason}. Change the keyword or pause one of them.", values);
  }
  return c.winner === "other"
    ? t("Conflict with “{name}” ({what}): “{name}” answers instead of this one, because {reason}. Change the keyword or pause one of them.", values)
    : t("Conflict with “{name}” ({what}): this one answers instead of “{name}”, because {reason}. Change the keyword or pause one of them.", values);
}

/** The tone of an overlap's note: neutral when both keep answering, yellow when one stops, red when one answers nothing at all. */
export function overlapTone(c: Conflict): "info" | "warning" | "danger" {
  return kindOf(c) === "split" ? "info" : c.never ? "danger" : "warning";
}

/** The note of one overlap: information for a split, a warning for a conflict. */
export function overlapText(c: Conflict, i18n: Text): string {
  return kindOf(c) === "split" ? splitText(c, i18n) : conflictWarningText(c, i18n);
}

/** The short tag of the automations list for the splits of one row. */
export function splitTag(channel: Channel, splits: Conflict[], { t }: Text): string {
  const name = splits[0]?.other.name ?? "";
  const count = splits.length;
  if (channel === "stories") return count === 1 ? t("Shares story replies with “{name}”", { name }) : t("Shares story replies with {count} automations", { count });
  if (channel === "direct") return count === 1 ? t("Shares messages with “{name}”", { name }) : t("Shares messages with {count} automations", { count });
  return count === 1 ? t("Shares comments with “{name}”", { name }) : t("Shares comments with {count} automations", { count });
}

export function channelOfType(type: "COMMENTS" | "STORIES" | "DIRECT"): Channel {
  return type === "COMMENTS" ? "comments" : type === "STORIES" ? "stories" : "direct";
}

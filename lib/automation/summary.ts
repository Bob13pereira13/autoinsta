import type { I18n } from "@/lib/i18n";

/**
 * One plain-language sentence describing what an automation does, shown live
 * at the top of the editor, e.g. "When someone comments "LINK" on any of your
 * posts, the person receives your link by DM and the comment is answered
 * publicly."
 */
export interface SummaryInput {
  type: "COMMENTS" | "STORIES" | "DIRECT";
  scope: "specific" | "any" | "next";
  keywords: string[];
  anyWord: boolean;
  storyReplies: boolean;
  storyMentions: boolean;
  hasLink: boolean;
  requireFollow: boolean;
  images: number;
  videos: number;
  followUp: boolean;
  followUpMinutes: number;
  publicReply: boolean;
  cooldownHours: number;
}

export function automationSummary({ t }: Pick<I18n, "t">, s: SummaryInput): string {
  const words = s.keywords.map((k) => `"${k}"`).join(t(" or "));
  const keyworded = !s.anyWord && s.keywords.length > 0;

  let trigger: string;
  if (s.type === "COMMENTS") {
    const scope =
      s.scope === "any" ? t("any of your posts") : s.scope === "next" ? t("your next post or reel") : t("the selected post");
    trigger = keyworded
      ? t("When someone comments {words} on {scope}", { words, scope })
      : t("When someone comments anything on {scope}", { scope });
  } else if (s.type === "STORIES") {
    if (s.storyReplies) {
      trigger = keyworded
        ? t("When someone replies {words} to one of your stories", { words })
        : t("When someone replies to one of your stories");
      if (s.storyMentions && s.anyWord) trigger += t(" or mentions you in their story");
    } else {
      trigger = t("When someone mentions you in their story");
    }
  } else {
    trigger = keyworded
      ? t("When someone sends you a direct message with {words}", { words })
      : t("When someone sends you any direct message");
  }

  const base = s.hasLink ? t("your link") : t("your message");
  let media = "";
  if (s.images > 0 && s.videos > 0) {
    media = s.images === 1 ? t("an image and a video") : t("{count} images and a video", { count: s.images });
  } else if (s.images > 0) {
    media = s.images === 1 ? t("an image") : t("{count} images", { count: s.images });
  } else if (s.videos > 0) {
    media = t("a video");
  }
  const what = media ? t("{message} with {media}", { message: base, media }) : base;

  let sentence =
    trigger +
    (s.requireFollow
      ? t(", the person follows you and then receives {what} by DM", { what })
      : t(", the person receives {what} by DM", { what }));

  if (s.type === "COMMENTS" && s.publicReply) sentence += t(" and the comment is answered publicly");
  if (s.followUp) {
    sentence +=
      s.followUpMinutes > 0
        ? t(", then a thank-you message {minutes} min later", { minutes: s.followUpMinutes })
        : t(", then a thank-you message");
  }
  if (s.type !== "COMMENTS" && s.anyWord) {
    sentence += t(" (at most once every {hours} h per person, and never while your team is talking to them)", {
      hours: s.cooldownHours,
    });
  }
  return `${sentence}.`;
}

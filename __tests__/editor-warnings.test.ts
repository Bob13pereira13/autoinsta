/**
 * Every warning of the automation editor: it shows when its condition happens
 * and goes away once fixed, with the agreed colour (warning = yellow, danger =
 * red, error = cannot save). Plus the account state shown in the editor and
 * the list.
 */
import { describe, expect, it } from "vitest";
import { editorWarnings, storageState, type EditorDraft, type WarningId } from "@/lib/automation/editor-warnings";
import { accountNeedsReconnect, accountProblem } from "@/lib/automation/account-status";

/** A Comments automation that raises nothing. */
const ok: EditorDraft = {
  type: "COMMENTS",
  deliveryMode: "direct",
  postScope: "posts",
  selectedPostCount: 1,
  matchAnyWord: false,
  keywords: ["catalogo"],
  wholeWordMatch: true,
  triggerStoryReplies: true,
  triggerStoryMentions: false,
  openingDmEnabled: false,
  openingDmMessage: "",
  openingDmButtonLabel: "",
  requireFollow: false,
  followPromptMessage: "",
  followPromptButtonLabel: "i'm following",
  dmMessage: "Oi {username}! Aqui está: {link}",
  hasLink: true,
  linkButtonLabel: "Abrir link",
  hasSecondLink: false,
  secondaryButtonLabel: "Open link",
  mediaCount: 0,
  followUpEnabled: false,
  followUpMessage: "",
  followUpDelayMinutes: 0,
  publicReplyEnabled: false,
  publicReplyMessages: [""],
};

const found = (draft: EditorDraft) => editorWarnings(draft).map((w) => `${w.id}:${w.tone}`);
const has = (draft: EditorDraft, id: WarningId) => editorWarnings(draft).find((w) => w.id === id);

/** Shows with `bad` (in its colour), gone with `fixed`. */
function toggles(id: WarningId, tone: "warning" | "danger" | "error", bad: Partial<EditorDraft>, fixed: Partial<EditorDraft>) {
  const shown = has({ ...ok, ...bad }, id);
  expect(shown?.tone, `${id} should show`).toBe(tone);
  expect(has({ ...ok, ...bad, ...fixed }, id), `${id} should go away`).toBeUndefined();
}

describe("a complete automation raises nothing", () => {
  it("Comments, Stories and Direct", () => {
    expect(found(ok)).toEqual([]);
    expect(found({ ...ok, type: "STORIES", postScope: "all" })).toEqual([]);
    expect(found({ ...ok, type: "DIRECT", postScope: "all" })).toEqual([]);
  });
});

describe("step 1 — When", () => {
  it("specific posts with none checked: cannot save", () => {
    toggles("postScopeEmpty", "error", { selectedPostCount: 0 }, { selectedPostCount: 2 });
    toggles("postScopeEmpty", "error", { selectedPostCount: 0 }, { postScope: "all" });
  });

  it("Stories: at least one box; mentions alone need “any reply”; mentions with a keyword warn", () => {
    const stories = { type: "STORIES" as const };
    toggles("storyNone", "error", { ...stories, triggerStoryReplies: false, triggerStoryMentions: false }, { triggerStoryReplies: true });
    toggles("storyMentionsNeedAny", "error", { ...stories, triggerStoryReplies: false, triggerStoryMentions: true }, { matchAnyWord: true });
    toggles("storyMentionsWithKeyword", "warning", { ...stories, triggerStoryMentions: true }, { triggerStoryMentions: false });
  });
});

describe("step 2 — Keyword", () => {
  it("no keyword: cannot save", () => {
    toggles("keywordMissing", "error", { keywords: [] }, { keywords: ["link"] });
    toggles("keywordMissing", "error", { keywords: [] }, { matchAnyWord: true });
  });

  it("repeated word, ignoring case and accents", () => {
    toggles("keywordDuplicate", "warning", { keywords: ["Preço", "preco"] }, { keywords: ["preço", "link"] });
    expect(has({ ...ok, keywords: ["Preço", "PRECO!"] }, "keywordDuplicate")?.word).toBe("PRECO!");
  });

  it("very short word (letters, not numbers)", () => {
    toggles("keywordShort", "warning", { keywords: ["eu"] }, { keywords: ["quero"] });
    expect(has({ ...ok, keywords: ["1"] }, "keywordShort")).toBeUndefined();
    expect(has({ ...ok, keywords: ["08"] }, "keywordShort")).toBeUndefined();
  });

  it("short word with “part of a word” on: red", () => {
    toggles("keywordShortPartial", "danger", { keywords: ["oi"], wholeWordMatch: false }, { wholeWordMatch: true });
    toggles("keywordShortPartial", "danger", { keywords: ["cor"], wholeWordMatch: false }, { keywords: ["cupom"] });
  });

  it("very common word", () => {
    toggles("keywordCommon", "warning", { keywords: ["lindo"] }, { keywords: ["link"] });
    toggles("keywordCommon", "warning", { keywords: ["Você"] }, { keywords: ["catalogo"] });
    // A phrase is not flagged.
    expect(has({ ...ok, keywords: ["eu quero"] }, "keywordCommon")).toBeUndefined();
  });

  it("more than 10 words, or a word over 50 characters: cannot save", () => {
    toggles("keywordTooMany", "error", { keywords: Array.from({ length: 11 }, (_, i) => `palavra${i}`) }, { keywords: ["link"] });
    toggles("keywordTooLong", "error", { keywords: ["x".repeat(51)] }, { keywords: ["x".repeat(50)] });
  });

  it("all posts + any comment, and Direct without a keyword: red", () => {
    toggles("allPostsAnyComment", "danger", { postScope: "all", matchAnyWord: true }, { matchAnyWord: false });
    toggles("allPostsAnyComment", "danger", { postScope: "all", matchAnyWord: true }, { postScope: "posts" });
    toggles("directAny", "danger", { type: "DIRECT", matchAnyWord: true }, { matchAnyWord: false });
  });
});

describe("step 3 — What the person receives", () => {
  it("opening DM: complete, no {link}, label up to 20", () => {
    const opening = { openingDmEnabled: true, openingDmMessage: "Quer o link?", openingDmButtonLabel: "Quero" };
    expect(found({ ...ok, ...opening })).toEqual([]);
    toggles("openingIncomplete", "error", { ...opening, openingDmButtonLabel: "" }, { openingDmButtonLabel: "Quero" });
    toggles("openingLinkToken", "error", { ...opening, openingDmMessage: "Tome: {link}" }, { openingDmMessage: "Toque abaixo" });
    toggles("labelTooLong", "error", { ...opening, openingDmButtonLabel: "x".repeat(21) }, { openingDmButtonLabel: "x".repeat(20) });
  });

  it("opening DM length: 640 characters (accents and emoji count 1)", () => {
    const opening = { openingDmEnabled: true, openingDmButtonLabel: "Quero" };
    toggles("textNearLimit", "warning", { ...opening, openingDmMessage: "é".repeat(600) }, { openingDmMessage: "é".repeat(500) });
    toggles("textOverLimit", "error", { ...opening, openingDmMessage: "😀".repeat(641) }, { openingDmMessage: "😀".repeat(640) });
  });

  it("follow request: everyone gets it without the opening DM; {link} is removed there", () => {
    toggles("followWithoutOpening", "warning", { requireFollow: true }, { openingDmEnabled: true, openingDmMessage: "Oi", openingDmButtonLabel: "Quero" });
    toggles("followLinkToken", "warning", { requireFollow: true, followPromptMessage: "Siga: {link}" }, { followPromptMessage: "Siga e toque" });
    toggles("labelTooLong", "error", { requireFollow: true, followPromptButtonLabel: "é".repeat(21) }, { followPromptButtonLabel: "Já sigo" });
  });

  it("main message: {link} without a link cannot be saved; a link without {link} warns", () => {
    toggles("mainTokenWithoutLink", "error", { hasLink: false, dmMessage: "Veja {link}" }, { hasLink: true });
    toggles("mainTokenWithoutLink", "error", { hasLink: false, dmMessage: "Veja {link}" }, { dmMessage: "Veja o catálogo" });
    toggles("mainLinkWithoutToken", "warning", { dmMessage: "Aqui está o catálogo" }, { dmMessage: "Aqui está: {link}" });
    toggles("mainMissing", "error", { dmMessage: "  " }, { dmMessage: "Oi" });
  });

  it("main message without a link: 1000 bytes (accent 2, emoji 4)", () => {
    const plain = { hasLink: false };
    toggles("textNearLimit", "warning", { ...plain, dmMessage: "é".repeat(460) }, { dmMessage: "é".repeat(400) });
    toggles("textOverLimit", "error", { ...plain, dmMessage: "é".repeat(501) }, { dmMessage: "é".repeat(500) });
    toggles("textOverLimit", "error", { ...plain, dmMessage: "😀".repeat(251) }, { dmMessage: "😀".repeat(250) });
    expect(has({ ...ok, ...plain, dmMessage: "é".repeat(501) }, "textOverLimit")?.limit).toEqual({ unit: "bytes", max: 1000, used: 1002 });
  });

  it("main message with a link: 640 characters", () => {
    toggles("textOverLimit", "error", { dmMessage: "é".repeat(641) + " {link}" }, { dmMessage: "é".repeat(640) + " {link}" });
    expect(has({ ...ok, dmMessage: "é".repeat(641) }, "textOverLimit")?.limit?.unit).toBe("chars");
  });

  it("link button labels up to 20", () => {
    toggles("labelTooLong", "error", { linkButtonLabel: "x".repeat(21) }, { linkButtonLabel: "Abrir" });
    toggles("labelTooLong", "error", { hasSecondLink: true, secondaryButtonLabel: "x".repeat(21) }, { secondaryButtonLabel: "Site" });
  });

  it("media in Comments: refused in “Direct” (no step), fine with the opening DM or the follow request", () => {
    toggles("mediaInDirectComments", "error", { mediaCount: 1 }, { openingDmEnabled: true, openingDmMessage: "Oi", openingDmButtonLabel: "Quero" });
    toggles("mediaInDirectComments", "error", { mediaCount: 1 }, { requireFollow: true, deliveryMode: "steps" });
    expect(has({ ...ok, type: "DIRECT", mediaCount: 2 }, "mediaInDirectComments")).toBeUndefined();
    expect(has({ ...ok, type: "STORIES", mediaCount: 2 }, "mediaInDirectComments")).toBeUndefined();
  });

  it("media on the follow request in Comments needs the opening DM (otherwise it is the text-only reply)", () => {
    const follow = { deliveryMode: "steps" as const, requireFollow: true, followPromptMediaCount: 1 };
    toggles("followMediaWithoutOpening", "error", follow, { openingDmEnabled: true, openingDmMessage: "Oi", openingDmButtonLabel: "Quero" });
    toggles("followMediaWithoutOpening", "error", follow, { followPromptMediaCount: 0 });
  });

  it("“With steps first” needs at least one step on", () => {
    toggles("stepsMissing", "error", { deliveryMode: "steps" }, { requireFollow: true });
    toggles("stepsMissing", "error", { deliveryMode: "steps" }, { openingDmEnabled: true, openingDmMessage: "Oi", openingDmButtonLabel: "Quero" });
    toggles("stepsMissing", "error", { deliveryMode: "steps" }, { deliveryMode: "direct" });
    // Stories and Direct have no opening DM: it does not count there.
    expect(has({ ...ok, type: "DIRECT", deliveryMode: "steps", openingDmEnabled: true }, "stepsMissing")?.tone).toBe("error");
  });

  it("thank-you: only after a button in Comments; late delay; {link} removed; 1000 bytes", () => {
    const followUp = { followUpEnabled: true, followUpMessage: "Valeu!" };
    toggles("followUpWithoutButton", "warning", followUp, { requireFollow: true });
    expect(has({ ...ok, ...followUp, type: "DIRECT" }, "followUpWithoutButton")).toBeUndefined();
    toggles("followUpLate", "warning", { ...followUp, followUpDelayMinutes: 1380 }, { followUpDelayMinutes: 60 });
    toggles("followUpLinkToken", "warning", { ...followUp, followUpMessage: "Valeu! {link}" }, { followUpMessage: "Valeu!" });
    toggles("textOverLimit", "error", { ...followUp, type: "DIRECT", followUpMessage: "é".repeat(501) }, { followUpMessage: "é".repeat(10) });
  });
});

describe("step 4 — Public reply", () => {
  it("a single variation warns; links in a comment are not clickable", () => {
    const pub = { publicReplyEnabled: true, publicReplyMessages: ["Te mandei na DM!", ""] };
    toggles("publicReplySingle", "warning", pub, { publicReplyMessages: ["Te mandei na DM!", "Olha a DM 📩"] });
    toggles("publicReplyLink", "warning", { ...pub, publicReplyMessages: ["Veja https://loja.test", "ok"] }, { publicReplyMessages: ["Veja a DM", "ok"] });
    toggles("publicReplyLink", "warning", { ...pub, publicReplyMessages: ["{link}", "ok"] }, { publicReplyMessages: ["DM!", "ok"] });
    toggles("publicReplyLink", "warning", { ...pub, publicReplyMessages: ["www.loja.test", "ok"] }, { publicReplyMessages: ["DM!", "ok"] });
  });
});

describe("media storage", () => {
  it("heads-up from 80%, red when full", () => {
    expect(storageState(79, 100)).toBe("ok");
    expect(storageState(80, 100)).toBe("near");
    expect(storageState(100, 100)).toBe("full");
  });
});

describe("account state", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  it("connection expired or revoked: reconnect", () => {
    expect(accountNeedsReconnect({ tokenInvalidAt: "2026-11-01T00:00:00Z" }, now)).toBe(true);
    expect(accountNeedsReconnect({ tokenExpiresAt: "2026-11-21T00:00:00Z" }, now)).toBe(true);
    expect(accountNeedsReconnect({ tokenExpiresAt: "2027-01-01T00:00:00Z" }, now)).toBe(false);
    expect(accountNeedsReconnect({}, now)).toBe(false);
  });

  it("turned off, reconnect (wins), or fine", () => {
    expect(accountProblem({ automationsEnabled: false }, now)).toBe("off");
    expect(accountProblem({ automationsEnabled: false, tokenInvalidAt: now }, now)).toBe("reconnect");
    expect(accountProblem({ automationsEnabled: true }, now)).toBeNull();
    expect(accountProblem(null, now)).toBeNull();
  });
});

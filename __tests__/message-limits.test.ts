/**
 * Instagram's text limits, measured as Meta counts them: plain text up to 1000
 * BYTES of UTF-8 (an accented letter takes 2, an emoji 4), text above buttons
 * up to 640 characters, button labels up to 20. Cuts never split a character.
 * {username} without a name disappears with its space ("Oi!", never "there").
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buttonTitleTooLong,
  charCount,
  limitState,
  messageLimit,
  truncateChars,
  truncateUtf8,
  utf8Bytes,
} from "@/lib/automation/message-limits";
import { automationRuleIssues, RULE_MESSAGES } from "@/lib/automation/rules";
import { renderMessageWithoutLink, renderMessageWithTracking, renderUsername } from "@/lib/tracking/message";
import { sendDirectMessage, sendPrivateReplyWithLinkButton } from "@/lib/meta/client";

describe("measuring", () => {
  it("bytes: accent 2, emoji 4", () => {
    expect(utf8Bytes("a")).toBe(1);
    expect(utf8Bytes("é")).toBe(2);
    expect(utf8Bytes("😀")).toBe(4);
    expect(utf8Bytes("Olá 😀")).toBe(1 + 1 + 2 + 1 + 4);
  });

  it("characters: an emoji is one", () => {
    expect(charCount("😀😀")).toBe(2);
    expect(charCount("ação")).toBe(4);
  });
});

describe("plain text: 1000 bytes", () => {
  const text = (s: string) => limitState(messageLimit(s, "text"));

  it("ASCII: 1000 fits, 1001 does not", () => {
    expect(text("a".repeat(1000))).toBe("near");
    expect(text("a".repeat(1001))).toBe("over");
  });

  it("accented letters count 2: 500 fit, 501 do not", () => {
    expect(messageLimit("é".repeat(500), "text").used).toBe(1000);
    expect(text("é".repeat(500))).toBe("near");
    expect(text("é".repeat(501))).toBe("over");
  });

  it("emoji count 4: 250 fit, 251 do not", () => {
    expect(text("😀".repeat(250))).toBe("near");
    expect(text("😀".repeat(251))).toBe("over");
  });

  it("a mix right at the edge", () => {
    // 996 bytes of "a" + "é" (2) = 998; one more emoji (4) passes 1000.
    expect(text("a".repeat(996) + "é")).toBe("near");
    expect(text("a".repeat(996) + "é" + "😀")).toBe("over");
  });

  it("heads-up from 90% (900 bytes)", () => {
    expect(text("a".repeat(899))).toBe("ok");
    expect(text("a".repeat(900))).toBe("near");
    expect(text("é".repeat(450))).toBe("near");
  });

  it("{username} counts as the longest name (30)", () => {
    expect(messageLimit("{username}", "text").used).toBe(30);
    expect(text("{username}" + "a".repeat(970))).toBe("near");
    expect(text("{username}" + "a".repeat(971))).toBe("over");
  });
});

describe("text with a button: 640 characters", () => {
  const button = (s: string) => limitState(messageLimit(s, "button"));

  it("accents and emoji count 1 each", () => {
    expect(button("é".repeat(640))).toBe("near");
    expect(button("é".repeat(641))).toBe("over");
    expect(button("😀".repeat(640))).toBe("near");
    expect(button("😀".repeat(641))).toBe("over");
  });

  it("{link} is not counted (the link is the button)", () => {
    expect(messageLimit("a".repeat(640) + " {link}", "button").used).toBe(640);
    expect(button("a".repeat(640) + " {link}")).toBe("near");
  });

  it("button labels: 20 characters, emoji count 1", () => {
    expect(buttonTitleTooLong("😀".repeat(20))).toBe(false);
    expect(buttonTitleTooLong("é".repeat(21))).toBe(true);
  });
});

describe("cutting never splits a character", () => {
  it("by bytes", () => {
    expect(truncateUtf8("aé😀", 3)).toBe("aé");
    expect(truncateUtf8("aé😀", 6)).toBe("aé");
    expect(truncateUtf8("aé😀", 7)).toBe("aé😀");
    const cut = truncateUtf8("é".repeat(600), 1000);
    expect(utf8Bytes(cut)).toBe(1000);
    expect(cut).toBe("é".repeat(500));
    // An odd budget cannot hold half an "é".
    expect(truncateUtf8("é".repeat(600), 999)).toBe("é".repeat(499));
  });

  it("by characters", () => {
    const cut = truncateChars("😀".repeat(700), 640);
    expect(charCount(cut)).toBe(640);
    expect(cut).toBe("😀".repeat(640));
    expect(truncateChars("abc", 10)).toBe("abc");
  });
});

describe("sending cuts at Instagram's limits", () => {
  const bodies: unknown[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    bodies.length = 0;
  });
  function stubFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ recipient_id: "u", message_id: "m" }), { status: 200 });
      })
    );
  }

  it("plain text goes out with at most 1000 bytes, cut between characters", async () => {
    stubFetch();
    await sendDirectMessage("token", "ig", "user", "😀".repeat(260));
    const text = (bodies[0] as { message: { text: string } }).message.text;
    expect(utf8Bytes(text)).toBe(1000);
    expect(text).toBe("😀".repeat(250));
  });

  it("text above a button keeps 640 whole characters; labels 20", async () => {
    stubFetch();
    await sendPrivateReplyWithLinkButton("token", "ig", "comment", "😀".repeat(700), [{ title: "é".repeat(30), url: "https://x.test" }]);
    const payload = (bodies[0] as { message: { attachment: { payload: { text: string; buttons: Array<{ title: string }> } } } }).message.attachment.payload;
    expect(payload.text).toBe("😀".repeat(640));
    expect(payload.buttons[0].title).toBe("é".repeat(20));
  });
});

describe("the server refuses what would not go out whole", () => {
  const base = { type: "COMMENTS" as const, matchAnyPost: true, matchAnyWord: true };
  const paths = (input: Parameters<typeof automationRuleIssues>[0]) => automationRuleIssues(input).map((i) => [i.path, i.message]);

  it("plain message: bytes", () => {
    expect(paths({ ...base, dmMessage: "é".repeat(500), hasLink: false })).toEqual([]);
    expect(paths({ ...base, dmMessage: "é".repeat(501), hasLink: false })).toEqual([["dmMessage", RULE_MESSAGES.textTooLong]]);
    expect(paths({ ...base, dmMessage: "😀".repeat(251), hasLink: false })).toEqual([["dmMessage", RULE_MESSAGES.textTooLong]]);
  });

  it("message with a link: 640 characters", () => {
    expect(paths({ ...base, dmMessage: "é".repeat(640) + " {link}", hasLink: true })).toEqual([]);
    expect(paths({ ...base, dmMessage: "é".repeat(641), hasLink: true })).toEqual([["dmMessage", RULE_MESSAGES.buttonTextTooLong]]);
  });

  it("{link} without a link is refused; with one it is fine", () => {
    expect(paths({ ...base, dmMessage: "Aqui: {link}", hasLink: false })).toEqual([["dmMessage", RULE_MESSAGES.linkTokenWithoutLink]]);
    expect(paths({ ...base, dmMessage: "Aqui: {link}", hasLink: true })).toEqual([]);
    // Unknown (an older client that does not say): not checked.
    expect(paths({ ...base, dmMessage: "Aqui: {link}" })).toEqual([]);
  });

  it("opening DM: no {link}, 640 characters, label up to 20", () => {
    const opening = { ...base, openingDmEnabled: true, openingDmButtonLabel: "Quero" };
    expect(paths({ ...opening, openingDmMessage: "Quer o link? {link}" })).toEqual([["openingDmMessage", RULE_MESSAGES.linkTokenInOpeningDm]]);
    expect(paths({ ...opening, openingDmMessage: "😀".repeat(641) })).toEqual([["openingDmMessage", RULE_MESSAGES.buttonTextTooLong]]);
    expect(paths({ ...opening, openingDmMessage: "Oi", openingDmButtonLabel: "x".repeat(21) })).toEqual([["openingDmButtonLabel", RULE_MESSAGES.buttonLabelTooLong]]);
    expect(paths({ ...opening, openingDmMessage: "Oi", openingDmButtonLabel: "😀".repeat(20) })).toEqual([]);
  });

  it("follow request: 640 characters; thank-you: 1000 bytes", () => {
    expect(paths({ ...base, requireFollow: true, followPromptMessage: "é".repeat(641) })).toEqual([["followPromptMessage", RULE_MESSAGES.buttonTextTooLong]]);
    expect(paths({ ...base, followUpEnabled: true, followUpMessage: "é".repeat(501) })).toEqual([["followUpMessage", RULE_MESSAGES.textTooLong]]);
    expect(paths({ ...base, followUpEnabled: true, followUpMessage: "é".repeat(500) })).toEqual([]);
    // Turned off: not checked.
    expect(paths({ ...base, followUpEnabled: false, followUpMessage: "é".repeat(501) })).toEqual([]);
  });
});

describe("{username} without a name", () => {
  it("goes away with its space or comma", () => {
    expect(renderUsername("Oi {username}!")).toBe("Oi!");
    expect(renderUsername("Olá, {username}!")).toBe("Olá!");
    expect(renderUsername("Hey {username}, here is the link")).toBe("Hey, here is the link");
    expect(renderUsername("{username}, aqui está")).toBe("aqui está");
    expect(renderUsername("Obrigado {username} pelo comentário")).toBe("Obrigado pelo comentário");
    expect(renderUsername("Oi {USERNAME}!\nLinha 2")).toBe("Oi!\nLinha 2");
  });

  it("never says “there”", () => {
    expect(renderMessageWithoutLink({ message: "Oi {username}! Veja: {link}" })).toBe("Oi! Veja:");
    expect(renderMessageWithTracking({ message: "Oi {username}!", commenterName: null })).toBe("Oi!");
  });

  it("with a name, it is used", () => {
    expect(renderUsername("Oi {username}!", "ana.silva")).toBe("Oi ana.silva!");
    expect(renderMessageWithTracking({ message: "Oi, {username}!", commenterName: "ana" })).toBe("Oi, ana!");
  });
});

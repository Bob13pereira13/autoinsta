import { describe, expect, it } from "vitest";
import { parseEchoEvents, parseMessageEvents } from "@/lib/meta/webhook";

function payload(messaging: unknown[]) {
  return { object: "instagram", entry: [{ id: "ig_acc", time: 1, messaging }] } as Parameters<typeof parseMessageEvents>[0];
}

describe("story replies vs direct messages", () => {
  it("marks a reply to the account's story as STORY_REPLY with the story id", () => {
    const events = parseMessageEvents(payload([{
      sender: { id: "u1" }, recipient: { id: "ig_acc" },
      message: { mid: "m1", text: "quero o LINK", reply_to: { story: { id: "st_9", url: "https://cdn/story.jpg" } } },
    }]));
    expect(events).toEqual([{ instagramAccountId: "ig_acc", messageId: "m1", messageText: "quero o LINK", senderId: "u1", channel: "STORY_REPLY", storyId: "st_9" }]);
  });

  it("keeps a reply to a normal message as DIRECT", () => {
    const events = parseMessageEvents(payload([{
      sender: { id: "u1" }, recipient: { id: "ig_acc" },
      message: { mid: "m2", text: "LINK", reply_to: { mid: "earlier" } },
    }]));
    expect(events[0].channel).toBe("DIRECT");
  });
});

describe("story mentions", () => {
  it("are STORY_MENTION with no text, even when Instagram adds a caption", () => {
    const events = parseMessageEvents(payload([{
      sender: { id: "u2" }, recipient: { id: "ig_acc" },
      message: { mid: "m3", attachments: [{ type: "story_mention", payload: { url: "https://cdn/mention.mp4" } }] },
    }, {
      sender: { id: "u3" }, recipient: { id: "ig_acc" },
      message: { mid: "m4", text: "LINK", attachments: [{ type: "story_mention", payload: { url: "https://cdn/x" } }] },
    }]));
    expect(events.map((e) => [e.channel, e.messageText])).toEqual([["STORY_MENTION", ""], ["STORY_MENTION", ""]]);
  });
});

describe("echoes", () => {
  it("are reported separately with the recipient, and never as inbound messages", () => {
    const body = payload([{
      sender: { id: "ig_acc" }, recipient: { id: "u1" },
      message: { mid: "m5", text: "Oi! Já te respondo", is_echo: true },
    }]);
    expect(parseMessageEvents(body)).toHaveLength(0);
    expect(parseEchoEvents(body)).toEqual([{ instagramAccountId: "ig_acc", recipientId: "u1", messageId: "m5" }]);
  });

  it("ignore the account messaging itself and non-echo messages", () => {
    expect(parseEchoEvents(payload([
      { sender: { id: "ig_acc" }, recipient: { id: "ig_acc" }, message: { mid: "m6", text: "x", is_echo: true } },
      { sender: { id: "u1" }, recipient: { id: "ig_acc" }, message: { mid: "m7", text: "x" } },
    ]))).toEqual([]);
  });
});

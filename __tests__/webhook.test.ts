/**
 * Webhook — Unit Tests
 *
 * Tests signature verification and comment event parsing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  verifyWebhookSignature,
  verifyWebhookVerifyToken,
  parseCommentEvents,
  parseMessageEvents,
  parsePostbackEvents,
  parseEchoEvents,
} from "../lib/meta/webhook";
import { createHmac } from "crypto";

// Mock the environment variable
beforeEach(() => {
  vi.stubEnv("FACEBOOK_APP_SECRET", "test_app_secret_12345");
});

describe("verifyWebhookSignature", () => {
  function createSignature(payload: string, secret: string): string {
    return (
      "sha256=" + createHmac("sha256", secret).update(payload).digest("hex")
    );
  }

  it("should return true for valid signature", () => {
    const payload = '{"test": "data"}';
    const signature = createSignature(payload, "test_app_secret_12345");
    expect(verifyWebhookSignature(payload, signature)).toBe(true);
  });

  it("should return false for invalid signature", () => {
    const payload = '{"test": "data"}';
    const signature = "sha256=invalid_signature_here";
    expect(verifyWebhookSignature(payload, signature)).toBe(false);
  });

  it("should return false for null signature", () => {
    expect(verifyWebhookSignature('{"test": "data"}', null)).toBe(false);
  });

  it("should return false for empty signature", () => {
    expect(verifyWebhookSignature('{"test": "data"}', "")).toBe(false);
  });

  it("should return false when payload is tampered", () => {
    const originalPayload = '{"test": "data"}';
    const signature = createSignature(originalPayload, "test_app_secret_12345");
    const tamperedPayload = '{"test": "tampered"}';
    expect(verifyWebhookSignature(tamperedPayload, signature)).toBe(false);
  });

  it("should return false when signed with wrong secret", () => {
    const payload = '{"test": "data"}';
    const signature = createSignature(payload, "wrong_secret");
    expect(verifyWebhookSignature(payload, signature)).toBe(false);
  });
});

describe("parseCommentEvents", () => {
  it("should parse a valid comment event", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_456",
                text: "I want the LINK!",
                from: {
                  id: "user_789",
                  username: "testuser",
                },
                media: {
                  id: "media_101",
                },
              },
            },
          ],
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      instagramAccountId: "page_123",
      commentId: "comment_456",
      commentText: "I want the LINK!",
      commenterId: "user_789",
      commenterName: "testuser",
      mediaId: "media_101",
    });
  });

  it("keeps the organic post id of a comment left on an ad", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_456",
                text: "Link",
                from: { id: "user_789", username: "testuser" },
                // A boosted post: the comment carries the ad's own media id,
                // while the campaign is bound to the post it was made from.
                media: {
                  id: "ad_media_999",
                  ad_id: "ad_123",
                  original_media_id: "media_101",
                  media_product_type: "AD",
                },
              },
            },
          ],
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0].mediaId).toBe("ad_media_999");
    expect(events[0].originalMediaId).toBe("media_101");
  });

  it("leaves originalMediaId unset when it repeats the media id", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_456",
                text: "Link",
                from: { id: "user_789", username: "testuser" },
                media: { id: "media_101", original_media_id: "media_101" },
              },
            },
          ],
        },
      ],
    };

    expect(parseCommentEvents(payload)[0].originalMediaId).toBeUndefined();
  });

  it("should ignore non-instagram objects", () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_456",
                text: "hello",
                from: { id: "user_789", username: "test" },
                media: { id: "media_101" },
              },
            },
          ],
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(0);
  });

  it("should ignore non-comment fields", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "messages",
              value: {
                id: "msg_456",
                text: "hello",
                from: { id: "user_789", username: "test" },
                media: { id: "media_101" },
              },
            },
          ],
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(0);
  });

  it("should handle multiple comment events in one payload", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_1",
                text: "LINK",
                from: { id: "user_1", username: "user1" },
                media: { id: "media_1" },
              },
            },
            {
              field: "comments",
              value: {
                id: "comment_2",
                text: "PRICE",
                from: { id: "user_2", username: "user2" },
                media: { id: "media_1" },
              },
            },
          ],
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(2);
  });

  it("should parse events with empty text so matching can decide later", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_1",
                text: "", // empty text
                from: { id: "user_1", username: "user1" },
                media: { id: "media_1" },
              },
            },
          ],
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0].commentText).toBe("");
  });

  it("should ignore comments from the connected account itself", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_1",
                text: "LINK",
                from: { id: "page_123", username: "ourbrand" },
                media: { id: "media_1" },
              },
            },
          ],
        },
      ],
    };

    expect(parseCommentEvents(payload)).toHaveLength(0);
  });

  it("should still parse other users' comments alongside a self-comment", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_1",
                text: "LINK",
                from: { id: "page_123", username: "ourbrand" },
                media: { id: "media_1" },
              },
            },
            {
              field: "comments",
              value: {
                id: "comment_2",
                text: "LINK",
                from: { id: "user_2", username: "user2" },
                media: { id: "media_1" },
              },
            },
          ],
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0].commenterId).toBe("user_2");
  });

  it("should handle entries without changes", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          // no changes field
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(0);
  });
});

describe("parseMessageEvents", () => {
  function messagingPayload(messaging: unknown[]) {
    return {
      object: "instagram",
      entry: [{ id: "ig_456", time: 1234567890, messaging }],
    } as Parameters<typeof parseMessageEvents>[0];
  }

  it("should parse an inbound DM", () => {
    const payload = messagingPayload([
      {
        sender: { id: "user_999" },
        recipient: { id: "ig_456" },
        message: { mid: "mid_abc", text: "send me the LINK please" },
      },
    ]);

    expect(parseMessageEvents(payload)).toEqual([
      {
        instagramAccountId: "ig_456",
        messageId: "mid_abc",
        messageText: "send me the LINK please",
        senderId: "user_999",
        channel: "DIRECT",
      },
    ]);
  });

  it("should ignore echoes of the account's own messages", () => {
    const payload = messagingPayload([
      {
        sender: { id: "ig_456" },
        recipient: { id: "user_999" },
        message: { mid: "mid_abc", text: "here's your link", is_echo: true },
      },
    ]);

    expect(parseMessageEvents(payload)).toHaveLength(0);
  });

  it("should ignore deleted and unsupported messages", () => {
    expect(
      parseMessageEvents(
        messagingPayload([
          {
            sender: { id: "user_999" },
            recipient: { id: "ig_456" },
            message: { mid: "mid_a", text: "link", is_deleted: true },
          },
          {
            sender: { id: "user_999" },
            recipient: { id: "ig_456" },
            message: { mid: "mid_b", text: "link", is_unsupported: true },
          },
        ])
      )
    ).toHaveLength(0);
  });

  it("keeps attachment-only DMs with empty text (only no-keyword automations answer them)", () => {
    const payload = messagingPayload([
      {
        sender: { id: "user_999" },
        recipient: { id: "ig_456" },
        message: { mid: "mid_abc", attachments: [{ type: "image" }] },
      },
    ]);

    expect(parseMessageEvents(payload)).toEqual([
      expect.objectContaining({ messageText: "", channel: "DIRECT" }),
    ]);
  });

  it("drops messages with neither text nor attachments", () => {
    const payload = messagingPayload([
      { sender: { id: "user_999" }, recipient: { id: "ig_456" }, message: { mid: "mid_abc", text: "   " } },
    ]);
    expect(parseMessageEvents(payload)).toHaveLength(0);
  });

  it("should ignore messages the account sent to itself", () => {
    const payload = messagingPayload([
      {
        sender: { id: "ig_456" },
        recipient: { id: "ig_456" },
        message: { mid: "mid_abc", text: "link" },
      },
    ]);

    expect(parseMessageEvents(payload)).toHaveLength(0);
  });

  it("should ignore postback events that carry no message", () => {
    const payload = messagingPayload([
      {
        sender: { id: "user_999" },
        recipient: { id: "ig_456" },
        postback: { mid: "mid_abc", payload: "reveal:auto_1" },
      },
    ]);

    expect(parseMessageEvents(payload)).toHaveLength(0);
  });

  it("should ignore non-instagram payloads", () => {
    expect(
      parseMessageEvents({
        object: "page",
        entry: [
          {
            id: "ig_456",
            time: 1,
            messaging: [
              {
                sender: { id: "user_999" },
                message: { mid: "mid_abc", text: "link" },
              },
            ],
          },
        ],
      })
    ).toHaveLength(0);
  });
});

describe("read receipts (messaging_seen)", () => {
  it("are not acted on: no message, button tap or echo comes out of one", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "ig_456",
          time: 1234567890,
          messaging: [
            {
              sender: { id: "commenter_999" },
              recipient: { id: "ig_456" },
              timestamp: 1770000000000,
              read: { watermark: 1770000000000 },
            },
          ],
        },
      ],
    };

    expect(parseMessageEvents(payload)).toEqual([]);
    expect(parsePostbackEvents(payload)).toEqual([]);
    expect(parseEchoEvents(payload)).toEqual([]);
    expect(parseCommentEvents(payload)).toEqual([]);
  });
});

describe("webhook signature hardening", () => {
  it("verifies the raw body bytes, including non-ASCII payloads", () => {
    vi.stubEnv("INSTAGRAM_APP_SECRET", "ig_secret");
    const raw = Buffer.from('{"text":"Olá, quero o LINK 🔗"}', "utf8");
    const signature =
      "sha256=" + createHmac("sha256", "ig_secret").update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, signature)).toBe(true);
    expect(verifyWebhookSignature(Buffer.concat([raw, Buffer.from(" ")]), signature)).toBe(false);
  });

  it("rejects a signature without the sha256= prefix", () => {
    const payload = '{"test": "data"}';
    const hex = createHmac("sha256", "test_app_secret_12345").update(payload).digest("hex");
    expect(verifyWebhookSignature(payload, hex)).toBe(false);
  });

  it("refuses to run with no app secret configured", () => {
    vi.stubEnv("FACEBOOK_APP_SECRET", "");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "");
    expect(() => verifyWebhookSignature("{}", "sha256=00")).toThrow(/required/);
  });
});

describe("verifyWebhookVerifyToken", () => {
  it("accepts only the configured token", () => {
    vi.stubEnv("WEBHOOK_VERIFY_TOKEN", "verify-me");
    expect(verifyWebhookVerifyToken("verify-me")).toBe(true);
    expect(verifyWebhookVerifyToken("verify-you")).toBe(false);
    expect(verifyWebhookVerifyToken(null)).toBe(false);
  });

  it("fails closed when WEBHOOK_VERIFY_TOKEN is unset", () => {
    vi.stubEnv("WEBHOOK_VERIFY_TOKEN", "");
    expect(verifyWebhookVerifyToken("")).toBe(false);
    expect(verifyWebhookVerifyToken("undefined")).toBe(false);
  });
});

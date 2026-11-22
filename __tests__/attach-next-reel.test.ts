/** "Next post or reel": the reel becomes the automation's single marked post. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const tx = {
    automation: { update: vi.fn() },
    automationPost: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  return {
    tx,
    prisma: {
      automation: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    },
    media: vi.fn(),
  };
});
vi.mock("@/lib/db/client", () => ({ prisma: m.prisma }));
vi.mock("@/lib/instagram/provider", () => ({
  createInstagramContext: async () => ({ provider: "META", accessToken: "t" }),
  hasInstagramCredentials: () => true,
  getUserMedia: m.media,
}));

import { attachPendingNextReels } from "../lib/automation/attach-next-reel";

beforeEach(() => vi.clearAllMocks());

describe("attachPendingNextReels", () => {
  it("binds the first reel published after creation as the marked post", async () => {
    m.prisma.automation.findMany.mockResolvedValue([
      { id: "auto", instagramAccountId: "acc", createdAt: new Date("2026-11-10T00:00:00Z"), instagramAccount: { id: "acc" } },
    ]);
    m.media.mockResolvedValue([
      { id: "old_reel", media_product_type: "REELS", timestamp: "2026-11-01T00:00:00Z", permalink: "https://instagram.com/reel/old" },
      { id: "photo", media_product_type: "FEED", timestamp: "2026-11-11T00:00:00Z" },
      { id: "new_reel", media_product_type: "REELS", timestamp: "2026-11-12T00:00:00Z", permalink: "https://instagram.com/reel/new" },
    ]);

    expect(await attachPendingNextReels()).toEqual({ checked: 1, bound: 1, failedAccounts: 0 });
    expect(m.tx.automation.update).toHaveBeenCalledWith({ where: { id: "auto" }, data: { pendingNextReel: false, matchAnyPost: false } });
    expect(m.tx.automationPost.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ automationId: "auto", postId: "new_reel", postUrl: "https://instagram.com/reel/new", position: 0 })],
    });
    expect(m.tx.automation.update).toHaveBeenCalledWith({
      where: { id: "auto" },
      data: { postId: "new_reel", postUrl: "https://instagram.com/reel/new" },
    });
  });

  it("waits when no reel was published yet", async () => {
    m.prisma.automation.findMany.mockResolvedValue([
      { id: "auto", instagramAccountId: "acc", createdAt: new Date("2026-11-10T00:00:00Z"), instagramAccount: { id: "acc" } },
    ]);
    m.media.mockResolvedValue([{ id: "old_reel", media_product_type: "REELS", timestamp: "2026-11-01T00:00:00Z" }]);
    expect((await attachPendingNextReels()).bound).toBe(0);
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });
});

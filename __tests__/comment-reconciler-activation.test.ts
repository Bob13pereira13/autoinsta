/**
 * The comment reconciler only answers comments made after the automation
 * became active (created or resumed) and after its account was reactivated,
 * unless the automation opted into "reply to people who commented in the
 * last 72h".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, queueAdd, readComments, jobs } = vi.hoisted(() => ({
  mockPrisma: {
    $queryRaw: vi.fn(),
    automation: { findMany: vi.fn() },
    dmLog: { findMany: vi.fn() },
    operationalEvent: { create: vi.fn() },
  },
  queueAdd: vi.fn(),
  readComments: vi.fn(),
  // BullMQ jobs by id, with their state.
  jobs: new Map<string, string>(),
}));
vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({
    add: queueAdd,
    getJob: async (id: string) => (jobs.has(id) ? { getState: async () => jobs.get(id) } : undefined),
  }),
}));
vi.mock("@/lib/instagram/provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/instagram/provider")>()),
  createInstagramContext: async () => ({ provider: "META", accessToken: "local-test" }),
  getRecentMediaComments: readComments,
}));
vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));

import { commentCutoffMs, reconcileComments } from "../lib/polling/comment-reconciler";

const HOUR = 60 * 60 * 1000;
const now = Date.now();
const ago = (hours: number) => new Date(now - hours * HOUR);

function campaign(over: Record<string, unknown> = {}, account: Record<string, unknown> = {}) {
  return {
    id: "campaign",
    name: "Campaign",
    workspaceId: "workspace",
    postId: "post_1",
    posts: [{ postId: "post_1" }],
    matchAnyPost: false,
    matchAnyWord: false,
    keywords: ["LINK"],
    wholeWordMatch: true,
    publicReplyEnabled: false,
    activeSince: ago(1),
    replyToRecentComments: false,
    instagramAccount: { id: "connection", instagramId: "owner", provider: "META", accessToken: "x", automationsResumedAt: null, ...account },
    ...over,
  };
}

const comment = (id: string, hoursAgo: number) => ({
  id,
  text: "LINK",
  from: { id: `reader_${id}`, username: id },
  timestamp: ago(hoursAgo).toISOString(),
});

const enqueuedIds = () => queueAdd.mock.calls.map((call) => call[1].commentId);

beforeEach(() => {
  vi.clearAllMocks();
  jobs.clear();
  mockPrisma.$queryRaw.mockResolvedValue([]);
  mockPrisma.dmLog.findMany.mockResolvedValue([]);
  mockPrisma.operationalEvent.create.mockResolvedValue({});
});

describe("commentCutoffMs", () => {
  const lookback = now - 72 * HOUR;

  it("is the activation time for a plain automation", () => {
    expect(commentCutoffMs(campaign({ activeSince: ago(2) }), lookback)).toBe(ago(2).getTime());
  });

  it("goes back 72 hours before activation when replyToRecentComments is on, within the lookback", () => {
    expect(commentCutoffMs(campaign({ activeSince: ago(2), replyToRecentComments: true }), lookback)).toBe(lookback);
    const recent = commentCutoffMs(campaign({ activeSince: ago(100), replyToRecentComments: true }), now - 200 * HOUR);
    expect(recent).toBe(ago(172).getTime());
  });

  it("never goes before the client's approval or reactivation", () => {
    const cutoff = commentCutoffMs(
      { ...campaign({ activeSince: ago(48), replyToRecentComments: true }), workspace: { automationsResumedAt: ago(2) } },
      lookback
    );
    expect(cutoff).toBe(ago(2).getTime());
  });

  it("never goes before the account's reactivation, even with replyToRecentComments", () => {
    const cutoff = commentCutoffMs(
      campaign({ activeSince: ago(5), replyToRecentComments: true }, { automationsResumedAt: ago(1) }),
      lookback
    );
    expect(cutoff).toBe(ago(1).getTime());
  });
});

describe("reconcileComments respects activation", () => {
  it("sweeps only automations of active accounts", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([]);
    await reconcileComments();
    expect(mockPrisma.automation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, type: "COMMENTS", instagramAccount: { automationsEnabled: true }, workspace: { status: "ACTIVE" } },
      })
    );
  });

  it("a new automation does not answer comments made before it was created", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([campaign({ activeSince: ago(1) })]);
    readComments.mockResolvedValue([comment("before", 3), comment("after", 0.5)]);
    await reconcileComments();
    expect(enqueuedIds()).toEqual(["after"]);
  });

  it("a resumed automation does not answer comments made while it was paused", async () => {
    // Created 48h ago, paused, resumed 1h ago (activeSince moves on resume).
    mockPrisma.automation.findMany.mockResolvedValue([campaign({ activeSince: ago(1), createdAt: ago(48) })]);
    readComments.mockResolvedValue([comment("during_pause", 10), comment("after_resume", 0.2)]);
    await reconcileComments();
    expect(enqueuedIds()).toEqual(["after_resume"]);
  });

  it("with replyToRecentComments it also answers comments up to 72h before activation", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([campaign({ activeSince: ago(1), replyToRecentComments: true })]);
    readComments.mockResolvedValue([comment("too_old", 80), comment("yesterday", 24), comment("after", 0.5)]);
    await reconcileComments();
    expect(enqueuedIds()).toEqual(["yesterday", "after"]);
  });

  it("a reactivated account does not answer comments made while it was deactivated", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      campaign({ activeSince: ago(48), replyToRecentComments: true }, { automationsResumedAt: ago(1) }),
    ]);
    readComments.mockResolvedValue([comment("while_off", 5), comment("after_on", 0.5)]);
    await reconcileComments();
    expect(enqueuedIds()).toEqual(["after_on"]);
  });

  describe("the wait before answering (dmDelaySeconds)", () => {
    const log = (commentId: string, over: Record<string, unknown> = {}) => ({
      commentId, status: "PENDING", attempts: 0, errorMessage: null, dmDeliveryUnconfirmed: false,
      publicReplySentAt: null, publicReplySkipReason: null, publicReplyDeliveryUnconfirmed: false, ...over,
    });

    it("a comment in its wait is left to its delayed job: the sweep adds nothing (no second public reply or DM)", async () => {
      mockPrisma.automation.findMany.mockResolvedValue([campaign({ activeSince: ago(2), publicReplyEnabled: true })]);
      readComments.mockResolvedValue([comment("waiting", 0.5), comment("running", 0.45), comment("ran_and_failed", 0.4), comment("new", 0.3)]);
      mockPrisma.dmLog.findMany.mockResolvedValue([
        log("waiting"),
        log("running"),
        // Its delayed job is done and the DM failed once: retried as before.
        log("ran_and_failed", { status: "FAILED", attempts: 1 }),
      ]);
      jobs.set("dmdelay_owner_waiting_0", "delayed");
      jobs.set("dmdelay_owner_running_0", "active");
      jobs.set("dmdelay_owner_ran_and_failed_0", "completed");
      await reconcileComments();
      expect(enqueuedIds()).toEqual(["ran_and_failed", "new"]);
      expect(mockPrisma.operationalEvent.create.mock.calls[0][0].data.payload).toMatchObject({ waiting: 2, enqueued: 2 });
    });

    it("nothing more goes after the team answered or the comment was deleted, even with the public reply never posted", async () => {
      mockPrisma.automation.findMany.mockResolvedValue([campaign({ activeSince: ago(2), publicReplyEnabled: true })]);
      readComments.mockResolvedValue([comment("team_answered", 0.5), comment("deleted_hidden", 0.45), comment("plan_limit", 0.4), comment("new", 0.3)]);
      mockPrisma.dmLog.findMany.mockResolvedValue([
        log("team_answered", { status: "SKIPPED_HUMAN_ACTIVE", publicReplySkipReason: "team_answered" }),
        log("deleted_hidden", { status: "SKIPPED_COMMENT_DELETED", publicReplySkipReason: "comment_hidden" }),
        log("plan_limit", { status: "SKIPPED_PLAN_LIMIT" }),
      ]);
      await reconcileComments();
      expect(enqueuedIds()).toEqual(["new"]);
    });

    it("a public reply not posted on purpose (the store had already replied) closes the reply like a posted one", async () => {
      mockPrisma.automation.findMany.mockResolvedValue([campaign({ activeSince: ago(2), publicReplyEnabled: true })]);
      readComments.mockResolvedValue([comment("store_replied", 0.5), comment("reply_failed", 0.4)]);
      mockPrisma.dmLog.findMany.mockResolvedValue([
        log("store_replied", { status: "SENT", attempts: 1, publicReplySkipReason: "account_replied" }),
        // A public reply that failed is still retried, as before.
        log("reply_failed", { status: "SENT", attempts: 1 }),
      ]);
      await reconcileComments();
      expect(enqueuedIds()).toEqual(["reply_failed"]);
    });
  });

  it("passes the cutoff to the comment reader so older pages are not fetched", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([campaign({ activeSince: ago(2) })]);
    readComments.mockResolvedValue([]);
    await reconcileComments();
    expect(readComments).toHaveBeenCalledWith(expect.objectContaining({ sinceMs: ago(2).getTime() }));
  });
});

describe("reconcileComments with several marked posts", () => {
  it("polls every marked post (at most 10) and maps ad copies to their post", async () => {
    const posts = Array.from({ length: 12 }, (_, i) => ({ postId: `p${i}` }));
    mockPrisma.automation.findMany.mockResolvedValue([campaign({ posts, postId: "p0", activeSince: ago(5) })]);
    mockPrisma.$queryRaw.mockImplementation(async () => []);
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ mediaId: "ad_of_p0" }]);
    readComments.mockImplementation(async ({ mediaId }: { mediaId: string }) =>
      mediaId === "ad_of_p0" ? [comment("on_ad", 1)] : mediaId === "p3" ? [comment("on_p3", 1)] : []
    );
    await reconcileComments();
    const polled = readComments.mock.calls.map((call) => call[0].mediaId);
    expect(polled).toEqual(["p0", "ad_of_p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"]);
    const jobs = queueAdd.mock.calls.map((call) => call[1]);
    expect(jobs).toEqual([
      expect.objectContaining({ commentId: "on_ad", mediaId: "ad_of_p0", originalMediaId: "p0" }),
      expect.objectContaining({ commentId: "on_p3", mediaId: "p3", originalMediaId: undefined }),
    ]);
  });
});

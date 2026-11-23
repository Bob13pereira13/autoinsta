import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: {
    automation: { findMany: vi.fn(), findFirst: vi.fn() },
    dmLog: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    postbackDelivery: { create: vi.fn(), delete: vi.fn() },
    instagramAccount: { findUnique: vi.fn() },
    operationalEvent: { create: vi.fn() },
    zernioConnection: { findUnique: vi.fn() },
    botMessage: { upsert: vi.fn(), findUnique: vi.fn() },
  },
  meta: {
    sendPrivateReply: vi.fn(),
    sendPrivateReplyWithButton: vi.fn(),
    sendPrivateReplyWithLinkButton: vi.fn(),
    sendDirectMessage: vi.fn(),
    sendDirectMessageWithButton: vi.fn(),
    sendDirectMessageWithLinkButton: vi.fn(),
    sendDirectAttachment: vi.fn(),
    sendCommentReply: vi.fn(),
    getCommentState: vi.fn(),
    getUserFollowStatus: vi.fn(),
    getUserUsername: vi.fn(),
  },
  rate: { reserveDMSlot: vi.fn(), releaseDMSlot: vi.fn(), reserveSendSlots: vi.fn(), countSendCalls: vi.fn() },
  guards: { claimReplyCooldown: vi.fn(), isHumanConversationActive: vi.fn(), handleEcho: vi.fn(), recordBotMessage: vi.fn(), humanRepliedSince: vi.fn() },
  queueAdd: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: m.prisma }));
vi.mock("@/lib/meta/client", () => ({
  ...m.meta,
  MetaApiError: class MetaApiError extends Error { code = 0; },
  TokenExpiredError: class TokenExpiredError extends Error {},
  RateLimitError: class RateLimitError extends Error {},
  PermissionError: class PermissionError extends Error {},
}));
vi.mock("@/lib/meta/oauth", () => ({ decryptToken: () => "token" }));
vi.mock("@/lib/utils/rate-limiter", () => m.rate);
vi.mock("@/lib/automation/guards", () => m.guards);
vi.mock("@/lib/billing/usage", () => ({
  reserveWorkspaceDMSend: vi.fn().mockResolvedValue({ allowed: true, periodStart: new Date(), limit: 1000 }),
  releaseWorkspaceDMReservation: vi.fn(),
}));
vi.mock("@/lib/ops/worker-health", () => ({ recordWorkerAlert: vi.fn() }));
vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({ add: m.queueAdd }),
  getRedisConnection: vi.fn(),
  POSTBACK_JOB_NAME: "process-postback",
  FOLLOWUP_JOB_NAME: "process-followup",
  MESSAGE_JOB_NAME: "process-message",
  ECHO_JOB_NAME: "process-echo",
}));
vi.mock("bullmq", () => ({
  Worker: function (_n: string, processor: unknown) {
    (global as Record<string, unknown>).__channelsProcessor = processor;
    return { on: vi.fn(), close: vi.fn() };
  },
  UnrecoverableError: class UnrecoverableError extends Error {},
}));

import { createDMWorker } from "../lib/queue/dm-worker";

type Job = { name?: string; data: Record<string, unknown>; id: string; attemptsMade: number };
function processor(): (job: Job) => Promise<void> {
  createDMWorker();
  return (global as Record<string, unknown>).__channelsProcessor as (job: Job) => Promise<void>;
}

const account = { id: "acc_row", instagramId: "ig_1", accessToken: "enc", provider: "META", metaLogin: "INSTAGRAM", workspaceId: "w1", zernioAccountId: null };
let n = 0;
function automation(over: Record<string, unknown>) {
  n++;
  return {
    id: `auto_${n}`, name: `A${n}`, type: "DIRECT", createdAt: new Date(2026, 0, n), workspaceId: "w1", instagramAccountId: "acc_row",
    keywords: [], matchAnyWord: false, wholeWordMatch: true, postId: null, matchAnyPost: false,
    triggerStoryReplies: true, triggerStoryMentions: false, replyCooldownHours: 24,
    dmMessage: "Oi {username}!", linkButtonLabel: null, requireFollow: false, followPromptMessage: null, followPromptButtonLabel: null,
    followUpEnabled: false, followUpMessage: null, followUpDelayMinutes: 0,
    openingDmEnabled: false, openingDmMessage: null, openingDmButtonLabel: null,
    publicReplyEnabled: false, publicReplyMessage: null, publicReplyMessages: [],
    isActive: true, instagramAccount: account, workspace: { id: "w1" }, trackedLinks: [], media: [],
    ...over,
  };
}

const message = (data: Record<string, unknown>): Job => ({
  name: "process-message",
  data: { instagramAccountId: "ig_1", messageId: "mid_1", messageText: "", senderId: "person_1", ...data },
  id: "job_msg",
  attemptsMade: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.prisma.dmLog.findUnique.mockResolvedValue(null);
  m.prisma.dmLog.findFirst.mockResolvedValue(null);
  m.prisma.dmLog.upsert.mockResolvedValue({});
  m.prisma.dmLog.update.mockResolvedValue({});
  m.prisma.dmLog.updateMany.mockResolvedValue({ count: 1 });
  m.prisma.postbackDelivery.create.mockResolvedValue({});
  m.prisma.operationalEvent.create.mockResolvedValue({});
  for (const fn of Object.values(m.meta)) fn.mockResolvedValue({ recipient_id: "person_1", message_id: "bot_mid" });
  m.meta.getUserFollowStatus.mockResolvedValue(true);
  m.meta.getCommentState.mockResolvedValue({ state: "visible", ownerReplied: false });
  m.meta.getUserUsername.mockResolvedValue("ana");
  m.rate.reserveDMSlot.mockResolvedValue({ allowed: true, reserved: true });
  m.rate.reserveSendSlots.mockResolvedValue(true);
  m.guards.claimReplyCooldown.mockResolvedValue({ allowed: true, release: vi.fn() });
  m.guards.isHumanConversationActive.mockResolvedValue(false);
  m.guards.humanRepliedSince.mockResolvedValue(false);
});

function lastLog() {
  const calls = m.prisma.dmLog.upsert.mock.calls;
  return calls[calls.length - 1]?.[0];
}

describe("one reply per message", () => {
  it("answers with the keyword automation only, never also with the any-word one", async () => {
    const any = automation({ matchAnyWord: true, createdAt: new Date(2020, 0, 1) });
    const kw = automation({ keywords: ["preço"], dmMessage: "Tabela!" });
    m.prisma.automation.findMany.mockResolvedValue([any, kw]);
    await processor()(message({ messageText: "qual o preço?" }));
    expect(m.meta.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(m.meta.sendDirectMessage.mock.calls[0][3]).toBe("Tabela!");
    expect(m.prisma.dmLog.upsert).toHaveBeenCalledTimes(1);
    expect(lastLog().create.automationId).toBe(kw.id);
  });

  it("routes story replies to Stories automations and DMs to Direct ones", async () => {
    m.prisma.automation.findMany.mockResolvedValue([]);
    await processor()(message({ channel: "STORY_REPLY", messageText: "LINK" }));
    expect(m.prisma.automation.findMany.mock.calls[0][0].where.type).toBe("STORIES");
    await processor()(message({ messageText: "LINK" }));
    expect(m.prisma.automation.findMany.mock.calls[1][0].where.type).toBe("DIRECT");
  });

  it("answers a story mention only with a no-keyword automation that enabled mentions", async () => {
    const withKeyword = automation({ type: "STORIES", keywords: ["LINK"], triggerStoryMentions: true });
    const any = automation({ type: "STORIES", matchAnyWord: true, triggerStoryMentions: true, dmMessage: "Obrigado pela marcação!" });
    m.prisma.automation.findMany.mockResolvedValue([withKeyword, any]);
    await processor()(message({ channel: "STORY_MENTION", messageText: "" }));
    expect(m.meta.sendDirectMessage.mock.calls[0][3]).toBe("Obrigado pela marcação!");
    expect(lastLog().create.commentText).toBe("(story mention)");
  });
});

describe("guards for automations without keywords", () => {
  it("does not answer while a human from the account is talking to the person, and logs why", async () => {
    m.prisma.automation.findMany.mockResolvedValue([automation({ matchAnyWord: true })]);
    m.guards.isHumanConversationActive.mockResolvedValue(true);
    await processor()(message({ messageText: "oi" }));
    expect(m.meta.sendDirectMessage).not.toHaveBeenCalled();
    expect(lastLog().create.status).toBe("SKIPPED_HUMAN_ACTIVE");
    expect(lastLog().create.errorMessage).toMatch(/24 hours/);
  });

  it("does not answer twice within the cooldown, and logs why", async () => {
    m.prisma.automation.findMany.mockResolvedValue([automation({ matchAnyWord: true, replyCooldownHours: 12 })]);
    m.guards.claimReplyCooldown.mockResolvedValue({ allowed: false });
    await processor()(message({ messageText: "oi de novo" }));
    expect(m.guards.claimReplyCooldown).toHaveBeenCalledWith(expect.objectContaining({ hours: 12, recipientId: "person_1" }));
    expect(m.meta.sendDirectMessage).not.toHaveBeenCalled();
    expect(lastLog().create.status).toBe("SKIPPED_COOLDOWN");
  });

  it("a blocked winner means nobody answers (no fallback to the next automation)", async () => {
    const older = automation({ matchAnyWord: true, createdAt: new Date(2020, 0, 1) });
    const newer = automation({ matchAnyWord: true, createdAt: new Date(2026, 5, 1) });
    m.prisma.automation.findMany.mockResolvedValue([older, newer]);
    m.guards.claimReplyCooldown.mockResolvedValue({ allowed: false });
    await processor()(message({ messageText: "oi" }));
    expect(m.guards.claimReplyCooldown).toHaveBeenCalledTimes(1);
    expect(m.guards.claimReplyCooldown.mock.calls[0][0].automationId).toBe(older.id);
    expect(m.meta.sendDirectMessage).not.toHaveBeenCalled();
  });

  it("keyword automations are not guarded", async () => {
    m.prisma.automation.findMany.mockResolvedValue([automation({ keywords: ["LINK"] })]);
    m.guards.isHumanConversationActive.mockResolvedValue(true);
    await processor()(message({ messageText: "LINK" }));
    expect(m.guards.claimReplyCooldown).not.toHaveBeenCalled();
    expect(m.meta.sendDirectMessage).toHaveBeenCalledTimes(1);
  });

  it("frees the cooldown when Meta rejects the send", async () => {
    const release = vi.fn();
    m.prisma.automation.findMany.mockResolvedValue([automation({ matchAnyWord: true })]);
    m.guards.claimReplyCooldown.mockResolvedValue({ allowed: true, release });
    const { MetaApiError } = await import("@/lib/meta/client");
    m.meta.sendDirectMessage.mockRejectedValue(new MetaApiError(10, undefined, undefined, "window closed"));
    await expect(processor()(message({ messageText: "oi" }))).rejects.toThrow();
    expect(lastLog().update.status).toBe("FAILED");
  });
});

describe("media", () => {
  const media = [
    { slot: "MAIN", kind: "IMAGE", storageKey: "img1.jpg", position: 0 },
    { slot: "MAIN", kind: "VIDEO", storageKey: "vid1.mp4", position: 1 },
    { slot: "FOLLOW_UP", kind: "IMAGE", storageKey: "later.png", position: 0 },
  ];

  it("sends the main message's media after the text, reserving one send per file", async () => {
    m.prisma.automation.findMany.mockResolvedValue([automation({ keywords: ["LINK"], media })]);
    await processor()(message({ messageText: "LINK" }));
    expect(m.rate.reserveSendSlots).toHaveBeenCalledWith("ig_1", 2);
    expect(m.meta.sendDirectAttachment.mock.calls.map((c) => c[3])).toEqual([
      { type: "image", url: expect.stringMatching(/\/media\/img1\.jpg$/) },
      { type: "video", url: expect.stringMatching(/\/media\/vid1\.mp4$/) },
    ]);
    const textOrder = m.meta.sendDirectMessage.mock.invocationCallOrder[0];
    expect(m.meta.sendDirectAttachment.mock.invocationCallOrder[0]).toBeGreaterThan(textOrder);
    expect(lastLog().create.status).toBe("SENT");
    expect(lastLog().create.errorMessage).toBeNull();
  });

  it("skips the media (not the text) when the hourly limit has no room, and says so in the log", async () => {
    m.prisma.automation.findMany.mockResolvedValue([automation({ keywords: ["LINK"], media })]);
    m.rate.reserveSendSlots.mockResolvedValue(false);
    await processor()(message({ messageText: "LINK" }));
    expect(m.meta.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(m.meta.sendDirectAttachment).not.toHaveBeenCalled();
    expect(lastLog().create.status).toBe("SENT");
    expect(lastLog().create.errorMessage).toMatch(/hourly send limit/);
  });

  it("keeps the delivered text as SENT when a media file fails", async () => {
    m.prisma.automation.findMany.mockResolvedValue([automation({ keywords: ["LINK"], media })]);
    m.meta.sendDirectAttachment.mockRejectedValueOnce(new Error("Media download timed out"));
    await processor()(message({ messageText: "LINK" }));
    expect(lastLog().create.status).toBe("SENT");
    expect(lastLog().create.errorMessage).toMatch(/1\/2 failed/);
  });
});

describe("comments", () => {
  const job: Job = {
    data: { instagramAccountId: "ig_1", commentId: "c1", commentText: "quero o LINK", commenterId: "person_1", commenterName: "ana", mediaId: "post1" },
    id: "job_c",
    attemptsMade: 0,
  };

  it("only the winning automation answers — DM and public reply", async () => {
    const anyPost = automation({ type: "COMMENTS", matchAnyPost: true, keywords: ["LINK"], createdAt: new Date(2020, 0, 1),
      publicReplyEnabled: true, publicReplyMessages: ["any-post reply"] });
    const specific = automation({ type: "COMMENTS", postId: "post1", keywords: ["LINK"],
      publicReplyEnabled: true, publicReplyMessages: ["specific reply"], dmMessage: "DM do post" });
    m.prisma.automation.findMany.mockResolvedValue([anyPost, specific]);
    m.rate.reserveDMSlot.mockResolvedValue({ allowed: true, reserved: true });
    await processor()(job);
    expect(m.meta.sendCommentReply).toHaveBeenCalledTimes(1);
    expect(m.meta.sendCommentReply.mock.calls[0][2]).toBe("specific reply");
    expect(m.meta.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(m.meta.sendPrivateReply.mock.calls[0][3]).toBe("DM do post");
    // The public reply is a Meta call too.
    expect(m.rate.countSendCalls).toHaveBeenCalledWith("ig_1");
    // Media never rides on the private reply.
    expect(m.meta.sendDirectAttachment).not.toHaveBeenCalled();
  });
});

describe("echoes", () => {
  it("hands echoes to the human-activity check", async () => {
    await processor()({ name: "process-echo", data: { instagramAccountId: "ig_1", accountConnectionId: "acc_row", recipientId: "person_1", messageId: "phone_mid", echo: true }, id: "e1", attemptsMade: 0 });
    expect(m.guards.handleEcho).toHaveBeenCalledWith({ accountConnectionId: "acc_row", recipientId: "person_1", messageId: "phone_mid" });
  });
});

describe("default texts are in Portuguese", () => {
  it("Direct follow gate with no texts of its own: the Portuguese request and “Já sigo”", async () => {
    m.meta.getUserFollowStatus.mockResolvedValue(false);
    m.prisma.automation.findMany.mockResolvedValue([
      automation({ keywords: ["LINK"], requireFollow: true, followPromptMessage: null, followPromptButtonLabel: null }),
    ]);
    await processor()(message({ messageText: "LINK" }));
    const [, , , text, button] = m.meta.sendDirectMessageWithButton.mock.calls[0];
    expect(text).toBe("Antes de te mandar o link, segue a gente aqui? Depois é só tocar no botão abaixo.");
    expect(button).toBe("Já sigo");
  });

  it("a message that is only {link}: “Aqui está o seu link:” above the “Abrir link” button", async () => {
    m.prisma.automation.findMany.mockResolvedValue([
      automation({
        keywords: ["LINK"],
        dmMessage: "{link}",
        trackedLinks: [{ slug: "s1", label: "Primary campaign link", destinationUrl: "https://loja.test" }],
      }),
    ]);
    await processor()(message({ messageText: "LINK" }));
    const [, , , text, buttons] = m.meta.sendDirectMessageWithLinkButton.mock.calls[0];
    expect(text).toBe("Aqui está o seu link:");
    expect(buttons[0].title).toBe("Abrir link");
  });
});

describe("wait before answering (dmDelaySeconds)", () => {
  const comment = (data: Record<string, unknown> = {}): Job => ({
    data: { instagramAccountId: "ig_1", commentId: "c9", commentText: "quero o LINK", commenterId: "person_1", commenterName: "ana", mediaId: "post1", ...data },
    id: "job_c9",
    attemptsMade: 0,
  });
  const commentAutomation = (over: Record<string, unknown> = {}) =>
    automation({ type: "COMMENTS", matchAnyPost: true, keywords: ["LINK"], publicReplyEnabled: true, publicReplyMessages: ["Te mandei na DM!"], dmMessage: "Aqui está", ...over });

  const delayed = (seconds: number) => comment({ dmDelayed: true, dmScheduledAt: new Date(Date.now() - seconds * 1000).toISOString() });
  const logUpdates = () => m.prisma.dmLog.update.mock.calls.map((c) => c[0].data);

  it("Comments: nothing goes before the wait — the public reply and the DM are one BullMQ job delayed by the chosen time", async () => {
    m.prisma.automation.findMany.mockResolvedValue([commentAutomation({ dmDelaySeconds: 30 })]);
    await processor()(comment());
    expect(m.meta.sendCommentReply).not.toHaveBeenCalled();
    expect(m.meta.sendPrivateReply).not.toHaveBeenCalled();
    expect(m.queueAdd).toHaveBeenCalledTimes(1);
    const [name, data, opts] = m.queueAdd.mock.calls[0];
    expect(name).toBe("process-comment");
    expect(data).toMatchObject({ commentId: "c9", dmDelayed: true });
    expect(Date.parse(data.dmScheduledAt)).not.toBeNaN();
    expect(opts).toEqual({ delay: 30_000, jobId: "dmdelay_ig_1_c9_0" });
    // Nothing checked or counted yet: all of it happens when the job runs.
    expect(m.meta.getCommentState).not.toHaveBeenCalled();
    expect(m.guards.humanRepliedSince).not.toHaveBeenCalled();
    expect(m.rate.reserveDMSlot).not.toHaveBeenCalled();
    expect(lastLog().create.status).toBe("PENDING");
  });

  it("Comments: after the wait, the comment is checked, then the public reply goes, then the DM", async () => {
    m.prisma.automation.findMany.mockResolvedValue([commentAutomation({ dmDelaySeconds: 30 })]);
    m.prisma.dmLog.findUnique.mockResolvedValue({ status: "PENDING", attempts: 0, publicReplySentAt: null });
    await processor()(delayed(30));
    expect(m.guards.humanRepliedSince).toHaveBeenCalledWith(expect.objectContaining({ recipientId: "person_1" }));
    expect(m.meta.getCommentState).toHaveBeenCalledWith(expect.anything(), "c9", "ig_1");
    expect(m.meta.sendCommentReply).toHaveBeenCalledTimes(1);
    expect(m.meta.sendCommentReply.mock.calls[0][2]).toBe("Te mandei na DM!");
    expect(m.meta.sendPrivateReply).toHaveBeenCalledTimes(1);
    const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0];
    expect(order(m.meta.getCommentState)).toBeLessThan(order(m.meta.sendCommentReply));
    expect(order(m.meta.sendCommentReply)).toBeLessThan(order(m.meta.sendPrivateReply));
    expect(m.rate.reserveDMSlot).toHaveBeenCalled();
    expect(m.queueAdd).not.toHaveBeenCalled();
  });

  it("Comments: a reply the store's account already made is not duplicated; the DM still goes", async () => {
    m.prisma.automation.findMany.mockResolvedValue([commentAutomation({ dmDelaySeconds: 60 })]);
    m.prisma.dmLog.findUnique.mockResolvedValue({ status: "PENDING", attempts: 0, publicReplySentAt: null });
    m.meta.getCommentState.mockResolvedValue({ state: "visible", ownerReplied: true });
    await processor()(delayed(60));
    expect(m.meta.sendCommentReply).not.toHaveBeenCalled();
    expect(logUpdates()).toContainEqual({ publicReplySkipReason: "account_replied" });
    expect(m.meta.sendPrivateReply).toHaveBeenCalledTimes(1);
  });

  it("Comments: an earlier version's job (public reply already out) only sends the DM", async () => {
    m.prisma.automation.findMany.mockResolvedValue([commentAutomation({ dmDelaySeconds: 30 })]);
    m.prisma.dmLog.findUnique.mockResolvedValue({ status: "PENDING", attempts: 0, publicReplySentAt: new Date() });
    m.meta.getCommentState.mockResolvedValue({ state: "visible", ownerReplied: true });
    await processor()(delayed(30));
    expect(m.meta.sendCommentReply).not.toHaveBeenCalled();
    expect(m.meta.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(logUpdates().some((d) => "publicReplySkipReason" in d)).toBe(false);
  });

  it("Comments: someone from the team answered in the Direct during the wait — neither the public reply nor the DM, and it is final", async () => {
    m.prisma.automation.findMany.mockResolvedValue([commentAutomation({ dmDelaySeconds: 60 })]);
    m.prisma.dmLog.findUnique.mockResolvedValue({ status: "PENDING", attempts: 0, publicReplySentAt: null });
    m.guards.humanRepliedSince.mockResolvedValue(true);
    await processor()(delayed(60));
    expect(m.meta.sendCommentReply).not.toHaveBeenCalled();
    expect(m.meta.sendPrivateReply).not.toHaveBeenCalled();
    expect(m.rate.reserveDMSlot).not.toHaveBeenCalled();
    // Decided before spending a call on the comment.
    expect(m.meta.getCommentState).not.toHaveBeenCalled();
    expect(logUpdates()).toContainEqual(
      expect.objectContaining({ status: "SKIPPED_HUMAN_ACTIVE", publicReplySkipReason: "team_answered" })
    );
    // A later pass (a repeated webhook, the comment sweep) leaves it alone.
    vi.clearAllMocks();
    m.prisma.automation.findMany.mockResolvedValue([commentAutomation({ dmDelaySeconds: 60 })]);
    m.prisma.dmLog.findUnique.mockResolvedValue({ status: "SKIPPED_HUMAN_ACTIVE", attempts: 0, publicReplySentAt: null, publicReplySkipReason: "team_answered" });
    await processor()(comment());
    expect(m.meta.sendCommentReply).not.toHaveBeenCalled();
    expect(m.meta.sendPrivateReply).not.toHaveBeenCalled();
    expect(m.queueAdd).not.toHaveBeenCalled();
  });

  it.each([
    ["deleted", "comment_deleted", "Not sent: the comment was deleted during the wait"],
    ["hidden", "comment_hidden", "Not sent: the comment was hidden during the wait"],
  ])("Comments: a comment %s during the wait is ignored — no failure, no retry", async (state, reason, errorMessage) => {
    m.prisma.automation.findMany.mockResolvedValue([commentAutomation({ dmDelaySeconds: 30 })]);
    m.prisma.dmLog.findUnique.mockResolvedValue({ status: "PENDING", attempts: 0, publicReplySentAt: null });
    m.meta.getCommentState.mockResolvedValue({ state, ownerReplied: false });
    // Resolves: BullMQ does not retry the job.
    await expect(processor()(delayed(30))).resolves.toBeUndefined();
    expect(m.meta.sendCommentReply).not.toHaveBeenCalled();
    expect(m.meta.sendPrivateReply).not.toHaveBeenCalled();
    expect(m.queueAdd).not.toHaveBeenCalled();
    expect(logUpdates()).toEqual([{ status: "SKIPPED_COMMENT_DELETED", errorMessage, publicReplySkipReason: reason }]);
    expect(logUpdates().some((d) => d.status === "FAILED" || "attempts" in d)).toBe(false);
    // Final: a later pass sends nothing.
    vi.clearAllMocks();
    m.prisma.automation.findMany.mockResolvedValue([commentAutomation({ dmDelaySeconds: 30 })]);
    m.prisma.dmLog.findUnique.mockResolvedValue({ status: "SKIPPED_COMMENT_DELETED", attempts: 0, publicReplySentAt: null, publicReplySkipReason: reason });
    await processor()(comment());
    expect(m.meta.sendCommentReply).not.toHaveBeenCalled();
    expect(m.queueAdd).not.toHaveBeenCalled();
  });

  it("Comments: a pass that only retries the public reply keeps the DM's SENT when the comment is gone", async () => {
    m.prisma.automation.findMany.mockResolvedValue([commentAutomation({ dmDelaySeconds: 30 })]);
    m.prisma.dmLog.findUnique.mockResolvedValue({ status: "SENT", attempts: 1, publicReplySentAt: null, publicReplyError: "rate limited" });
    m.meta.getCommentState.mockResolvedValue({ state: "hidden", ownerReplied: false });
    await processor()(delayed(30));
    expect(m.meta.sendCommentReply).not.toHaveBeenCalled();
    expect(m.meta.sendPrivateReply).not.toHaveBeenCalled();
    expect(logUpdates()).toEqual([{ publicReplySkipReason: "comment_hidden" }]);
  });

  it("Comments: if Instagram cannot tell the comment's state, both go as without the check", async () => {
    m.prisma.automation.findMany.mockResolvedValue([commentAutomation({ dmDelaySeconds: 30 })]);
    m.prisma.dmLog.findUnique.mockResolvedValue({ status: "PENDING", attempts: 0, publicReplySentAt: null });
    m.meta.getCommentState.mockRejectedValue(new Error("Meta is down"));
    await processor()(delayed(30));
    expect(m.meta.sendCommentReply).toHaveBeenCalledTimes(1);
    expect(m.meta.sendPrivateReply).toHaveBeenCalledTimes(1);
  });

  it("Comments: an account turned off during the wait answers nothing (no candidate when it runs)", async () => {
    m.prisma.automation.findMany.mockResolvedValue([]);
    await processor()(comment({ dmDelayed: true, dmScheduledAt: new Date().toISOString() }));
    const where = m.prisma.automation.findMany.mock.calls[0][0].where;
    expect(where.instagramAccount).toMatchObject({ automationsEnabled: true });
    expect(where).toMatchObject({ isActive: true, workspace: { status: "ACTIVE" } });
    expect(m.meta.sendPrivateReply).not.toHaveBeenCalled();
  });

  it("Direct: the reply is a delayed job; the guards run when it is sent", async () => {
    m.prisma.automation.findMany.mockResolvedValue([automation({ matchAnyWord: true, dmDelaySeconds: 300 })]);
    await processor()(message({ messageText: "oi" }));
    expect(m.meta.sendDirectMessage).not.toHaveBeenCalled();
    expect(m.guards.claimReplyCooldown).not.toHaveBeenCalled();
    expect(m.guards.isHumanConversationActive).not.toHaveBeenCalled();
    const [name, data, opts] = m.queueAdd.mock.calls[0];
    expect(name).toBe("process-message");
    expect(data).toMatchObject({ messageId: "mid_1", dmDelayed: true });
    expect(opts).toEqual({ delay: 300_000, jobId: `dmdelay_ig_1_${Buffer.from("mid_1").toString("base64url")}` });
    expect(lastLog().create.status).toBe("PENDING");
  });

  it("Direct: delayed pass with no team reply sends (cooldown and the 24 h pause checked then)", async () => {
    m.prisma.automation.findMany.mockResolvedValue([automation({ matchAnyWord: true, dmDelaySeconds: 30, dmMessage: "Oi! Já te respondo" })]);
    await processor()(message({ messageText: "oi", dmDelayed: true, dmScheduledAt: new Date(Date.now() - 30_000).toISOString() }));
    expect(m.guards.isHumanConversationActive).toHaveBeenCalled();
    expect(m.guards.claimReplyCooldown).toHaveBeenCalled();
    expect(m.meta.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(m.queueAdd).not.toHaveBeenCalled();
  });

  it("Direct: someone from the team answered during the wait — no reply, even with a keyword", async () => {
    m.prisma.automation.findMany.mockResolvedValue([automation({ keywords: ["preço"], dmDelaySeconds: 30, dmMessage: "Tabela!" })]);
    m.guards.humanRepliedSince.mockResolvedValue(true);
    await processor()(message({ messageText: "qual o preço?", dmDelayed: true, dmScheduledAt: new Date(Date.now() - 30_000).toISOString() }));
    expect(m.meta.sendDirectMessage).not.toHaveBeenCalled();
    expect(lastLog().update.status ?? lastLog().create.status).toBe("SKIPPED_HUMAN_ACTIVE");
  });

  it("no wait (0, every existing automation): sent at once, exactly as before", async () => {
    m.prisma.automation.findMany.mockResolvedValue([automation({ keywords: ["preço"], dmMessage: "Tabela!", dmDelaySeconds: 0 })]);
    await processor()(message({ messageText: "qual o preço?" }));
    expect(m.meta.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(m.queueAdd).not.toHaveBeenCalled();
    expect(m.guards.humanRepliedSince).not.toHaveBeenCalled();
    vi.clearAllMocks();
    m.prisma.automation.findMany.mockResolvedValue([commentAutomation()]); // no dmDelaySeconds at all
    m.rate.reserveDMSlot.mockResolvedValue({ allowed: true, reserved: true });
    await processor()(comment());
    expect(m.meta.sendCommentReply).toHaveBeenCalledTimes(1);
    expect(m.meta.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(m.queueAdd).not.toHaveBeenCalled();
    // No extra Instagram call and no team check without a wait.
    expect(m.meta.getCommentState).not.toHaveBeenCalled();
    expect(m.guards.humanRepliedSince).not.toHaveBeenCalled();
  });
});


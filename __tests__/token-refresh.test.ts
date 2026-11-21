import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  instagramAccount: { findMany: vi.fn(), update: vi.fn() },
  operationalEvent: { create: vi.fn() },
}));
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/meta/oauth", () => ({
  decryptToken: (value: string) => `plain:${value}`,
  encryptToken: (value: string) => `enc:${value}`,
}));
vi.mock("@/lib/meta/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meta/client")>()),
  refreshLongLivedToken: refresh,
}));

import { MetaApiError, TokenExpiredError } from "@/lib/meta/client";
import {
  isDueForRefresh,
  refreshCutoff,
  refreshExpiringTokens,
  REFRESH_WINDOW_DAYS,
} from "@/lib/meta/token-refresh";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-21T05:00:00Z");
const account = { id: "acc1", workspaceId: "ws1", username: "loja", accessToken: "cipher" };

beforeEach(() => {
  vi.clearAllMocks();
  db.instagramAccount.findMany.mockResolvedValue([account]);
});

describe("token refresh schedule", () => {
  it("refreshes a 60-day token once it is 45 days old (15 days left)", () => {
    expect(REFRESH_WINDOW_DAYS).toBe(15);
    const issued = now.getTime() - 45 * DAY;
    expect(isDueForRefresh(new Date(issued + 60 * DAY), now)).toBe(true);
    expect(isDueForRefresh(new Date(now.getTime() + 16 * DAY), now)).toBe(false);
    expect(isDueForRefresh(null, now)).toBe(false);
    expect(refreshCutoff(now).getTime() - now.getTime()).toBe(15 * DAY);
  });

  it("only selects valid META tokens inside the window", async () => {
    refresh.mockResolvedValue({ accessToken: "new", expiresIn: 5184000 });
    await refreshExpiringTokens(now);
    expect(db.instagramAccount.findMany.mock.calls[0][0].where).toEqual({
      accessToken: { not: "" },
      provider: "META",
      metaLogin: "INSTAGRAM",
      tokenInvalidAt: null,
      tokenExpiresAt: { not: null, lte: refreshCutoff(now) },
    });
  });

  it("stores the new token encrypted and clears the invalid flag", async () => {
    refresh.mockResolvedValue({ accessToken: "new", expiresIn: 5184000 });
    const results = await refreshExpiringTokens(now);
    expect(refresh).toHaveBeenCalledWith("plain:cipher");
    const update = db.instagramAccount.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "acc1" });
    expect(update.data.accessToken).toBe("enc:new");
    expect(update.data.tokenInvalidAt).toBeNull();
    expect(results[0].status).toBe("refreshed");
  });

  it("flags a revoked token for reconnection instead of retrying forever", async () => {
    refresh.mockRejectedValue(new TokenExpiredError("Error validating access token"));
    const results = await refreshExpiringTokens(now);
    expect(db.instagramAccount.update).toHaveBeenCalledWith({
      where: { id: "acc1" },
      data: { tokenInvalidAt: now },
    });
    expect(results[0].status).toBe("invalid");
    expect(db.operationalEvent.create).toHaveBeenCalledOnce();
  });

  it("leaves a transient failure for the next daily run", async () => {
    refresh.mockRejectedValue(new MetaApiError(2, undefined, undefined, "Service temporarily unavailable"));
    const results = await refreshExpiringTokens(now);
    expect(db.instagramAccount.update).not.toHaveBeenCalled();
    expect(results[0].status).toBe("failed");
    expect(db.operationalEvent.create.mock.calls[0][0].data.message).toMatch(/retry/);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, mockExchange } = vi.hoisted(() => ({
  mockPrisma: {
    workspaceMember: { findFirst: vi.fn() },
    workspace: { findUnique: vi.fn() },
    instagramAccount: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    operationalEvent: { create: vi.fn() },
  },
  mockExchange: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "user" } })),
}));
vi.mock("@/lib/workspace-access", () => ({ canManageWorkspace: () => true }));
vi.mock("@/lib/instagram-accounts", () => ({
  canConnectInstagramAccount: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("@/lib/meta/oauth", () => ({
  verifyOAuthState: () => ({ workspaceId: "workspace", ts: Date.now() }),
  exchangeCodeForToken: mockExchange,
  encryptToken: (value: string) => `enc:${value}`,
}));

import { GET } from "../app/api/instagram/callback/route";

const fetchMock = vi.fn();
function respond(body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status: 200 })
  );
}
function callback() {
  return GET(
    new NextRequest("https://app.test/api/instagram/callback?code=c&state=s")
  );
}
const urls = () => fetchMock.mock.calls.map(([url]) => String(url));
// Instagram ids already connected to the workspace (simulated).
let workspaceAccounts: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  // Drop queued responses too, so one test's leftovers never feed the next.
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXTAUTH_URL", "https://app.test");
  mockPrisma.workspaceMember.findFirst.mockResolvedValue({ role: "OWNER" });
  mockPrisma.workspace.findUnique.mockResolvedValue({ status: "ACTIVE", instagramAccountLimit: 10 });
  workspaceAccounts = [];
  mockPrisma.instagramAccount.count.mockImplementation(async ({ where }: { where: { instagramId?: string; workspaceId: string } }) =>
    where.instagramId ? workspaceAccounts.filter((id) => id === where.instagramId).length : workspaceAccounts.length
  );
  mockPrisma.instagramAccount.create.mockImplementation(async ({ data }: { data: { instagramId: string } }) => {
    workspaceAccounts.push(data.instagramId);
    return data;
  });
  mockPrisma.instagramAccount.findUnique.mockResolvedValue(null);
  mockPrisma.operationalEvent.create.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());

describe("Instagram OAuth callback", () => {
  it("connects through Instagram Login exactly as before when Unified login is not configured", async () => {
    vi.stubEnv("INSTAGRAM_APP_SECRET", "ig-secret");
    mockExchange.mockResolvedValue({ accessToken: "short", userId: "1" });
    respond({ access_token: "long", expires_in: 5184000 });
    respond({ id: "app-scoped", user_id: "ig1", username: "shop" });
    respond({ success: true });

    const response = await callback();

    expect(response.headers.get("location")).toBe(
      "https://app.test/accounts?instagram=connected"
    );
    expect(urls()[0]).toMatch(/^https:\/\/graph\.instagram\.com\/v[\d.]+\/access_token\?/);
    expect(urls()[1]).toMatch(/^https:\/\/graph\.instagram\.com\/v[\d.]+\/me\?/);
    expect(urls()[2]).toMatch(/^https:\/\/graph\.instagram\.com\/v[\d.]+\/ig1\/subscribed_apps$/);
    expect(mockPrisma.instagramAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        instagramId: "ig1",
        accessToken: "enc:long",
        metaLogin: "INSTAGRAM",
        tokenExpiresAt: expect.any(Date),
      }),
    });
  });

  it("connects every account a Unified login granted, on graph.facebook.com", async () => {
    vi.stubEnv("META_LOGIN_CONFIG_ID", "config");
    vi.stubEnv("META_APP_ID", "app");
    vi.stubEnv("FACEBOOK_APP_SECRET", "secret");
    mockExchange.mockResolvedValue({ accessToken: "suat", userId: "" });
    respond({ data: { expires_at: 0, user_id: "122000000000001" } });
    respond({ data: [{ id: "ig1" }, { id: "ig2" }] });
    respond({ id: "ig1", username: "one" });
    respond({ success: true });
    respond({ id: "ig2", username: "two" });
    respond({ success: true });

    const response = await callback();

    expect(response.headers.get("location")).toBe(
      "https://app.test/accounts?instagram=connected"
    );
    expect(urls().every((url) => url.startsWith("https://graph.facebook.com/"))).toBe(true);
    expect(urls()[0]).toContain("/debug_token?");
    expect(urls()[0]).toContain("access_token=app%7Csecret");
    expect(urls()[1]).toContain("/me/assigned_instagram_accounts?");
    expect(urls()[2]).toContain("/ig1?");
    expect(urls()[2]).not.toContain("user_id");
    expect(urls()[3]).toMatch(/\/ig1\/subscribed_apps$/);
    expect(urls()[4]).toContain("/ig2?");
    expect(mockPrisma.instagramAccount.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.instagramAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        instagramId: "ig2",
        username: "two",
        accessToken: "enc:suat",
        metaLogin: "UNIFIED",
        // A token that never expires stores no expiry.
        tokenExpiresAt: null,
        webhookSubscribed: true,
        // Kept for Meta's data deletion / deauthorize callbacks.
        metaLoginUserId: "122000000000001",
        instagramScopedId: null,
        tokenInvalidAt: null,
      }),
    });
  });

  it("moves an existing Instagram Login account to Unified login when it reconnects", async () => {
    vi.stubEnv("META_LOGIN_CONFIG_ID", "config");
    vi.stubEnv("META_APP_ID", "app");
    vi.stubEnv("FACEBOOK_APP_SECRET", "secret");
    mockExchange.mockResolvedValue({ accessToken: "suat", userId: "" });
    mockPrisma.instagramAccount.findUnique.mockResolvedValue({ id: "row" });
    mockPrisma.instagramAccount.updateMany.mockResolvedValue({ count: 1 });
    respond({ data: { expires_at: 1_900_000_000 } });
    respond({ data: [{ id: "ig1" }] });
    respond({ id: "ig1", username: "one" });
    respond({ success: true });

    await callback();

    expect(mockPrisma.instagramAccount.updateMany).toHaveBeenCalledWith({
      where: { id: "row", workspaceId: "workspace", provider: "META" },
      data: expect.objectContaining({
        metaLogin: "UNIFIED",
        accessToken: "enc:suat",
        tokenExpiresAt: new Date(1_900_000_000 * 1000),
      }),
    });
  });

  it("explains a Unified login that granted no Instagram account", async () => {
    vi.stubEnv("META_LOGIN_CONFIG_ID", "config");
    vi.stubEnv("META_APP_ID", "app");
    vi.stubEnv("FACEBOOK_APP_SECRET", "secret");
    mockExchange.mockResolvedValue({ accessToken: "suat", userId: "" });
    respond({ data: { expires_at: 0 } });
    respond({ data: [] });

    const response = await callback();

    expect(response.headers.get("location")).toContain("instagram=failed");
    expect(decodeURIComponent(response.headers.get("location")!)).toContain(
      "business_management"
    );
    expect(mockPrisma.instagramAccount.create).not.toHaveBeenCalled();
  });

  describe("account limit", () => {
    function unified(accountIds: string[]) {
      vi.stubEnv("META_LOGIN_CONFIG_ID", "config");
      vi.stubEnv("META_APP_ID", "app");
      vi.stubEnv("FACEBOOK_APP_SECRET", "secret");
      mockExchange.mockResolvedValue({ accessToken: "suat", userId: "" });
      respond({ data: { expires_at: 0, user_id: "122000000000001" } });
      respond({ data: accountIds.map((id) => ({ id })) });
      for (const id of accountIds) {
        respond({ id, username: id });
        respond({ success: true });
      }
    }

    it("blocks a new account beyond the limit and says how many the plan allows", async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({ status: "ACTIVE", instagramAccountLimit: 1 });
      workspaceAccounts = ["ig_existing"];
      unified(["ig_new"]);
      const response = await callback();
      expect(response.headers.get("location")).toBe("https://app.test/accounts?instagram=limit&max=1&connected=0");
      expect(mockPrisma.instagramAccount.create).not.toHaveBeenCalled();
      // The webhook subscription for the refused account is never made.
      expect(urls().some((url) => url.includes("/ig_new/subscribed_apps"))).toBe(false);
    });

    it("connects up to the limit and reports the rest", async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({ status: "ACTIVE", instagramAccountLimit: 2 });
      workspaceAccounts = ["ig_existing"];
      unified(["ig_a", "ig_b"]);
      const response = await callback();
      expect(response.headers.get("location")).toBe("https://app.test/accounts?instagram=limit&max=2&connected=1");
      expect(workspaceAccounts).toEqual(["ig_existing", "ig_a"]);
    });

    it("always lets the client reconnect an account it already has", async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({ status: "ACTIVE", instagramAccountLimit: 1 });
      workspaceAccounts = ["ig_existing"];
      mockPrisma.instagramAccount.findUnique.mockResolvedValue({ id: "row", workspaceId: "workspace", provider: "META" });
      mockPrisma.instagramAccount.updateMany.mockResolvedValue({ count: 1 });
      unified(["ig_existing"]);
      const response = await callback();
      expect(response.headers.get("location")).toBe("https://app.test/accounts?instagram=connected");
      expect(mockPrisma.instagramAccount.updateMany).toHaveBeenCalled();
    });

    it("a client that is not ACTIVE cannot connect accounts", async () => {
      for (const status of ["PENDING_APPROVAL", "REJECTED", "DISABLED"]) {
        mockPrisma.workspace.findUnique.mockResolvedValue({ status, instagramAccountLimit: 5 });
        const response = await callback();
        expect(response.headers.get("location")).toBe("https://app.test/accounts?instagram=forbidden");
      }
      expect(mockExchange).not.toHaveBeenCalled();
    });
  });
});

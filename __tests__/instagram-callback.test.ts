import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, mockExchange } = vi.hoisted(() => ({
  mockPrisma: {
    workspaceMember: { findFirst: vi.fn() },
    workspace: { findUnique: vi.fn() },
    platformSettings: { findUnique: vi.fn() },
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
// Meta's answer to GET /{ig-id}/subscribed_apps after the subscription.
const FIELDS = ["comments", "messages", "messaging_postbacks", "message_echoes"];
const CONFIRMED = { data: [{ id: "app", name: "App", subscribed_fields: FIELDS }] };
const ALL_PERMISSIONS = ["instagram_business_basic", "instagram_business_manage_comments", "instagram_business_manage_messages"];
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
  // Platform default limit: none, unless a test sets one.
  mockPrisma.platformSettings.findUnique.mockResolvedValue({ defaultInstagramAccountLimit: null });
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

/**
 * Instagram's login as Meta answers it: the code → a short-lived token, the
 * app-scoped id and the permissions left on; then the 60-day token, /me (the
 * professional account id in user_id), the webhook subscription and Meta's
 * confirmation of it.
 */
function instagramLogin({
  id = "ig1",
  username = "shop",
  scopedId = "app-scoped",
  permissions = ALL_PERMISSIONS as string[],
}: { id?: string; username?: string; scopedId?: string; permissions?: string[] } = {}) {
  mockExchange.mockResolvedValue({ accessToken: "short", userId: scopedId, permissions });
  respond({ access_token: "long", token_type: "bearer", expires_in: 5184000 });
  respond({ id: scopedId, user_id: id, username, name: "Shop" });
  respond({ success: true });
  respond(CONFIRMED);
}

describe("Instagram OAuth callback (Business Login for Instagram)", () => {
  beforeEach(() => {
    vi.stubEnv("INSTAGRAM_APP_ID", "app");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "ig-secret");
  });

  it("connects: 60-day token, the professional account id (user_id), notifications on, all on graph.instagram.com", async () => {
    instagramLogin();
    const before = Date.now();

    const response = await callback();

    expect(response.headers.get("location")).toBe("https://app.test/accounts?instagram=connected");
    expect(urls()).toHaveLength(4);
    expect(urls().every((url) => url.startsWith("https://graph.instagram.com/"))).toBe(true);
    const exchange = new URL(urls()[0]);
    expect(exchange.pathname).toMatch(/^\/v[\d.]+\/access_token$/);
    expect(exchange.searchParams.get("grant_type")).toBe("ig_exchange_token");
    expect(exchange.searchParams.get("client_secret")).toBe("ig-secret");
    expect(exchange.searchParams.get("access_token")).toBe("short");
    const me = new URL(urls()[1]);
    expect(me.pathname).toMatch(/^\/v[\d.]+\/me$/);
    expect(me.searchParams.get("fields")).toContain("user_id");
    // Subscribed by the professional account id, with the 60-day token.
    expect(urls()[2]).toMatch(/^https:\/\/graph\.instagram\.com\/v[\d.]+\/ig1\/subscribed_apps$/);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).subscribed_fields).toEqual(FIELDS);
    expect(fetchMock.mock.calls[2][1].headers).toMatchObject({ Authorization: "Bearer long" });
    expect(urls()[3]).toMatch(/\/ig1\/subscribed_apps\?access_token=long$/);

    const { data } = mockPrisma.instagramAccount.create.mock.calls[0][0];
    expect(data).toMatchObject({
      workspaceId: "workspace",
      provider: "META",
      metaLogin: "INSTAGRAM",
      // What webhooks carry as entry.id: receipts and the account filter match it.
      instagramId: "ig1",
      // The app-scoped id from /me, kept for the deauthorize and data deletion callbacks.
      instagramScopedId: "app-scoped",
      metaLoginUserId: null,
      username: "shop",
      name: "Shop",
      accessToken: "enc:long",
      webhookSubscribed: true,
      tokenInvalidAt: null,
    });
    // 60 days from now, renewed by the daily routine.
    expect(data.tokenExpiresAt.getTime()).toBeGreaterThanOrEqual(before + 5184000_000 - 1000);
    expect(data.tokenExpiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 5184000_000);
  });

  it("Meta without user_id: the id of /me is used", async () => {
    mockExchange.mockResolvedValue({ accessToken: "short", userId: "ig9", permissions: ALL_PERMISSIONS });
    respond({ access_token: "long", expires_in: 5184000 });
    respond({ id: "ig9", username: "nine" });
    respond({ success: true });
    respond(CONFIRMED);
    expect((await callback()).headers.get("location")).toBe("https://app.test/accounts?instagram=connected");
    expect(mockPrisma.instagramAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ instagramId: "ig9", instagramScopedId: null }),
    });
  });

  it("an account from the old Facebook (Unified) login reconnects in place: same row and automations, Instagram token", async () => {
    mockPrisma.instagramAccount.findUnique.mockResolvedValue({ id: "row", workspaceId: "workspace", provider: "META", metaLogin: "UNIFIED" });
    mockPrisma.instagramAccount.updateMany.mockResolvedValue({ count: 1 });
    workspaceAccounts = ["ig1"];
    instagramLogin();

    expect((await callback()).headers.get("location")).toBe("https://app.test/accounts?instagram=connected");

    expect(mockPrisma.instagramAccount.create).not.toHaveBeenCalled();
    expect(mockPrisma.instagramAccount.updateMany).toHaveBeenCalledWith({
      where: { id: "row", workspaceId: "workspace", provider: "META" },
      data: expect.objectContaining({
        metaLogin: "INSTAGRAM",
        accessToken: "enc:long",
        tokenExpiresAt: expect.any(Date),
        // The "reconnect" mark set by the migration is cleared.
        tokenInvalidAt: null,
        webhookSubscribed: true,
        instagramScopedId: "app-scoped",
        metaLoginUserId: null,
      }),
    });
  });

  describe("every way the login can end lands on Accounts with a code it explains (never an error page)", () => {
    const location = (response: Response) => response.headers.get("location");
    const events = () => mockPrisma.operationalEvent.create.mock.calls.map(([arg]) => arg.data);
    const metaError = (code: number, message = "(#200) Permissions error") =>
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message, type: "OAuthException", code, fbtrace_id: "trace" } }), { status: 403 }));

    it("cancel on Instagram's screen → denied, nothing asked of Meta", async () => {
      const response = await GET(new NextRequest("https://app.test/api/instagram/callback?error=access_denied&error_reason=user_denied&state=s"));
      expect(location(response)).toBe("https://app.test/accounts?instagram=denied");
      expect(mockExchange).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a permission turned off on Instagram's screen → missing_permissions naming it; nothing connected, nothing else asked", async () => {
      mockExchange.mockResolvedValue({ accessToken: "short", userId: "1", permissions: ["instagram_business_basic", "instagram_business_manage_comments"] });
      expect(location(await callback())).toBe("https://app.test/accounts?instagram=missing_permissions&missing=instagram_business_manage_messages");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockPrisma.instagramAccount.create).not.toHaveBeenCalled();
      expect(events()).toContainEqual(
        expect.objectContaining({
          level: "WARNING",
          message: expect.stringContaining("instagram_business_basic, instagram_business_manage_comments"),
          payload: { granted: ["instagram_business_basic", "instagram_business_manage_comments"], missing: ["instagram_business_manage_messages"] },
        })
      );
    });

    it("the permissions under their old names (business_basic…) count as granted", async () => {
      instagramLogin({ permissions: ["business_basic", "business_manage_comments", "business_manage_messages"] });
      expect(location(await callback())).toBe("https://app.test/accounts?instagram=connected");
    });

    it("Meta does not list the permissions → not held against the person; connected", async () => {
      instagramLogin({ permissions: [] });
      expect(location(await callback())).toBe("https://app.test/accounts?instagram=connected");
    });

    it("the account refused for lack of permission (code 10, or any 2xx code) → missing_permissions naming instagram_business_basic", async () => {
      for (const code of [10, 200, 299]) {
        fetchMock.mockReset();
        mockPrisma.instagramAccount.create.mockClear();
        mockExchange.mockResolvedValue({ accessToken: "short", userId: "1", permissions: ALL_PERMISSIONS });
        respond({ access_token: "long", expires_in: 5184000 });
        metaError(code, "(#10) Application does not have permission for this action");
        expect(location(await callback()), String(code)).toBe("https://app.test/accounts?instagram=missing_permissions&missing=instagram_business_basic");
        expect(mockPrisma.instagramAccount.create).not.toHaveBeenCalled();
      }
      expect(events()).toContainEqual(
        expect.objectContaining({ level: "ERROR", message: "Instagram connection refused by Meta: missing instagram_business_basic" })
      );
    });

    it("another Meta error in an essential call (e.g. code 100) is not called a permission → failed", async () => {
      mockExchange.mockResolvedValue({ accessToken: "short", userId: "1", permissions: ALL_PERMISSIONS });
      respond({ access_token: "long", expires_in: 5184000 });
      metaError(100, "Unsupported get request");
      expect(location(await callback())).toBe("https://app.test/accounts?instagram=failed");
    });

    it("Meta refuses the webhook subscription → connected, with the warning that automations cannot answer yet", async () => {
      mockExchange.mockResolvedValue({ accessToken: "short", userId: "1", permissions: ALL_PERMISSIONS });
      respond({ access_token: "long", expires_in: 5184000 });
      respond({ id: "app-scoped", user_id: "ig1", username: "one" });
      metaError(200, "(#200) Permissions error");
      respond({ data: [] });
      const response = await callback();
      expect(location(response)).toBe("https://app.test/accounts?instagram=connected&webhooks=off");
      expect(mockPrisma.instagramAccount.create).toHaveBeenCalledWith({ data: expect.objectContaining({ webhookSubscribed: false }) });
      expect(events()).toContainEqual(
        expect.objectContaining({
          level: "ERROR",
          message: "Instagram notifications for @one: subscription failed",
          payload: expect.objectContaining({ subscribeError: expect.stringContaining("Permissions error"), confirmedFields: [] }),
        })
      );
    });

    it("subscribed, and Meta's confirmation recorded in Diagnostics: every field, or the ones missing", async () => {
      instagramLogin({ username: "one" });
      expect(location(await callback())).toBe("https://app.test/accounts?instagram=connected");
      expect(events()).toContainEqual(
        expect.objectContaining({
          level: "INFO",
          message: "Instagram notifications for @one: Meta confirms comments, messages, messaging_postbacks, message_echoes",
          payload: expect.objectContaining({ instagramId: "ig1", requestedFields: FIELDS, missing: [] }),
        })
      );

      // Meta lists this app with comments only: the record says what is missing.
      fetchMock.mockReset();
      mockPrisma.operationalEvent.create.mockClear();
      mockExchange.mockResolvedValue({ accessToken: "short", userId: "1", permissions: ALL_PERMISSIONS });
      respond({ access_token: "long", expires_in: 5184000 });
      respond({ id: "app-scoped", user_id: "ig1", username: "one" });
      respond({ success: true });
      respond({ data: [{ id: "other-app", subscribed_fields: ["messages"] }, { id: "app", subscribed_fields: ["comments"] }] });
      expect(location(await callback())).toBe("https://app.test/accounts?instagram=connected");
      expect(events()).toContainEqual(
        expect.objectContaining({
          level: "WARNING",
          message: "Instagram notifications for @one: Meta does not confirm messages, messaging_postbacks, message_echoes",
          payload: expect.objectContaining({ confirmedFields: ["comments"], missing: ["messages", "messaging_postbacks", "message_echoes"] }),
        })
      );
    });

    it("a failure anywhere (Meta down, database error) → failed, Meta's text kept for the admin only", async () => {
      mockExchange.mockRejectedValue(new Error("Token exchange failed: Invalid verification code format."));
      const response = await callback();
      expect(location(response)).toBe("https://app.test/accounts?instagram=failed");
      expect(mockPrisma.operationalEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ payload: { reason: "Token exchange failed: Invalid verification code format." } }),
      });
      mockPrisma.workspaceMember.findFirst.mockRejectedValue(new Error("database is down"));
      expect(location(await callback())).toBe("https://app.test/accounts?instagram=failed");
    });

    it("the account belongs to another workspace → already_connected", async () => {
      const { canConnectInstagramAccount } = await import("@/lib/instagram-accounts");
      vi.mocked(canConnectInstagramAccount).mockResolvedValueOnce({ allowed: false } as never);
      instagramLogin();
      expect(location(await callback())).toBe("https://app.test/accounts?instagram=already_connected");
      expect(mockPrisma.instagramAccount.create).not.toHaveBeenCalled();
    });
  });

  describe("account limit", () => {
    it("blocks a new account beyond the limit and says how many the plan allows", async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({ status: "ACTIVE", instagramAccountLimit: 1 });
      workspaceAccounts = ["ig_existing"];
      instagramLogin({ id: "ig_new" });
      const response = await callback();
      expect(response.headers.get("location")).toBe("https://app.test/accounts?instagram=limit&max=1&connected=0");
      expect(mockPrisma.instagramAccount.create).not.toHaveBeenCalled();
      // The webhook subscription for the refused account is never made.
      expect(urls().some((url) => url.includes("/ig_new/subscribed_apps"))).toBe(false);
    });

    it("connects below the limit, and without a limit", async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({ status: "ACTIVE", instagramAccountLimit: 2 });
      workspaceAccounts = ["ig_existing"];
      instagramLogin({ id: "ig_a" });
      expect((await callback()).headers.get("location")).toBe("https://app.test/accounts?instagram=connected");

      fetchMock.mockReset();
      mockPrisma.workspace.findUnique.mockResolvedValue({ status: "ACTIVE", instagramAccountLimit: null });
      instagramLogin({ id: "ig_b" });
      expect((await callback()).headers.get("location")).toBe("https://app.test/accounts?instagram=connected");
      expect(workspaceAccounts).toEqual(["ig_existing", "ig_a", "ig_b"]);
    });

    it("a numeric platform default blocks a client that follows the default", async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({ status: "ACTIVE", instagramAccountLimit: null });
      mockPrisma.platformSettings.findUnique.mockResolvedValue({ defaultInstagramAccountLimit: 1 });
      workspaceAccounts = ["ig_existing"];
      instagramLogin({ id: "ig_a" });
      expect((await callback()).headers.get("location")).toBe("https://app.test/accounts?instagram=limit&max=1&connected=0");
      expect(workspaceAccounts).toEqual(["ig_existing"]);
    });

    it("the client's own limit wins over the platform default (both ways)", async () => {
      // Own 1 under a default of 5: blocked.
      mockPrisma.workspace.findUnique.mockResolvedValue({ status: "ACTIVE", instagramAccountLimit: 1 });
      mockPrisma.platformSettings.findUnique.mockResolvedValue({ defaultInstagramAccountLimit: 5 });
      workspaceAccounts = ["ig_existing"];
      instagramLogin({ id: "ig_a" });
      expect((await callback()).headers.get("location")).toBe("https://app.test/accounts?instagram=limit&max=1&connected=0");
      // Own 3 over a default of 1: allowed.
      fetchMock.mockReset();
      mockPrisma.workspace.findUnique.mockResolvedValue({ status: "ACTIVE", instagramAccountLimit: 3 });
      mockPrisma.platformSettings.findUnique.mockResolvedValue({ defaultInstagramAccountLimit: 1 });
      instagramLogin({ id: "ig_b" });
      expect((await callback()).headers.get("location")).toBe("https://app.test/accounts?instagram=connected");
      expect(workspaceAccounts).toEqual(["ig_existing", "ig_b"]);
    });

    it("always lets the client reconnect an account it already has", async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({ status: "ACTIVE", instagramAccountLimit: 1 });
      workspaceAccounts = ["ig_existing"];
      mockPrisma.instagramAccount.findUnique.mockResolvedValue({ id: "row", workspaceId: "workspace", provider: "META" });
      mockPrisma.instagramAccount.updateMany.mockResolvedValue({ count: 1 });
      instagramLogin({ id: "ig_existing" });
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

/** proxy.ts answers 403 on /admin for anyone not in ADMIN_EMAILS. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { proxy } from "../proxy";

const SECRET = "test-secret-with-enough-length-0123456789";
const COOKIE = "authjs.session-token";

async function sessionCookie(email: string, secret = SECRET) {
  return `${COOKIE}=${await encode({ token: { sub: "u1", email }, secret, salt: COOKIE })}`;
}
function request(path: string, cookie?: string) {
  return new NextRequest(`http://app.test${path}`, { headers: cookie ? { cookie } : {} });
}
const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

beforeAll(() => {
  vi.stubEnv("NEXTAUTH_SECRET", SECRET);
  vi.stubEnv("ADMIN_EMAILS", "dono@plataforma.test");
});
afterAll(() => vi.unstubAllEnvs());

describe("admin area in proxy.ts", () => {
  it("answers 403 to a signed-in user who is not an admin, on pages and APIs", async () => {
    const cookie = await sessionCookie("cliente@loja.test");
    for (const path of ["/admin", "/admin/clients", "/admin/clients/abc", "/admin/settings"]) {
      const res = await proxy(request(path, cookie));
      expect(res.status, path).toBe(403);
    }
    const api = await proxy(request("/api/admin/clients", cookie));
    expect(api.status).toBe(403);
    expect(await api.json()).toEqual({ success: false, error: "Forbidden" });
  });

  it("lets the admin through", async () => {
    const cookie = await sessionCookie("Dono@Plataforma.test");
    expect(passes(await proxy(request("/admin", cookie)))).toBe(true);
    expect(passes(await proxy(request("/api/admin/overview", cookie)))).toBe(true);
  });

  it("a forged session (wrong secret) does not get in", async () => {
    const cookie = await sessionCookie("dono@plataforma.test", "another-secret-with-enough-length-0000");
    expect((await proxy(request("/admin", cookie))).status).toBe(403);
  });

  it("sends a visitor without a session to the login page, and APIs answer 403", async () => {
    const page = await proxy(request("/admin/clients"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/login?callbackUrl=%2Fadmin%2Fclients");
    expect((await proxy(request("/api/admin/clients"))).status).toBe(403);
  });

  it("keeps the customers' Diagnostics API open", async () => {
    const cookie = await sessionCookie("cliente@loja.test");
    expect(passes(await proxy(request("/api/admin/diagnostics", cookie)))).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ data: new Map<string, number>(), failConnect: false, connects: 0 }));
vi.mock("ioredis", () => ({
  default: class FakeRedis {
    on() {}
    async connect() {
      store.connects++;
      if (store.failConnect) throw new Error("ECONNREFUSED");
    }
    async get(key: string) {
      return store.data.has(key) ? String(store.data.get(key)) : null;
    }
    async incr(key: string) {
      const next = (store.data.get(key) ?? 0) + 1;
      store.data.set(key, next);
      return next;
    }
    async expire() {
      return 1;
    }
    async del(key: string) {
      store.data.delete(key);
      return 1;
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  store.data.clear();
  store.failConnect = false;
  store.connects = 0;
});

describe("login throttle", () => {
  it("blocks an e-mail after 5 failures and counts from the very first attempt", async () => {
    const rl = await import("@/lib/account/login-rate-limit");
    for (let i = 0; i < rl.MAX_FAILURES_PER_EMAIL; i++) {
      expect(await rl.isLoginBlocked("a@loja.test", "10.0.0.1")).toBe(false);
      await rl.recordLoginFailure("a@loja.test", "10.0.0.1");
    }
    expect(await rl.isLoginBlocked("a@loja.test", "10.0.0.9")).toBe(true);
    expect(await rl.isLoginBlocked("b@loja.test", "10.0.0.9")).toBe(false);
    expect(store.connects).toBe(1);
  });

  it("blocks an IP that tries many different e-mails", async () => {
    const rl = await import("@/lib/account/login-rate-limit");
    for (let i = 0; i < rl.MAX_FAILURES_PER_IP; i++) {
      await rl.recordLoginFailure(`user${i}@loja.test`, "10.0.0.2");
    }
    expect(await rl.isLoginBlocked("novo@loja.test", "10.0.0.2")).toBe(true);
  });

  it("clears the e-mail counter after a successful login", async () => {
    const rl = await import("@/lib/account/login-rate-limit");
    for (let i = 0; i < 5; i++) await rl.recordLoginFailure("c@loja.test", null);
    await rl.clearLoginFailures("c@loja.test");
    expect(await rl.isLoginBlocked("c@loja.test", null)).toBe(false);
  });

  it("fails open when Redis is unreachable", async () => {
    store.failConnect = true;
    const rl = await import("@/lib/account/login-rate-limit");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await rl.isLoginBlocked("d@loja.test", "10.0.0.3")).toBe(false);
    await expect(rl.recordLoginFailure("d@loja.test", "10.0.0.3")).resolves.toBeUndefined();
  });

  it("reads the client IP Traefik appended (the last X-Forwarded-For entry), never a forgeable one", async () => {
    const { getClientIp } = await import("@/lib/account/login-rate-limit");
    // The visitor sent "203.0.113.7"; Traefik appended the real address.
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 198.51.100.4" }))).toBe("198.51.100.4");
    expect(getClientIp(new Headers({ "x-forwarded-for": "198.51.100.4" }))).toBe("198.51.100.4");
    // Headers only a proxy in front would set are ignored: there is none.
    expect(getClientIp(new Headers({ "x-real-ip": "203.0.113.8" }))).toBeNull();
    expect(getClientIp(new Headers({ "cf-connecting-ip": "203.0.113.9" }))).toBeNull();
    expect(getClientIp(new Headers({ "x-forwarded-for": "1.1.1.1, not-an-ip" }))).toBeNull();
    expect(getClientIp(new Headers())).toBeNull();
  });
});

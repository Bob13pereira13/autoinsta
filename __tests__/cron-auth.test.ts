import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

afterEach(() => vi.unstubAllEnvs());

describe("cron route authorization", () => {
  it("accepts the configured CRON_SECRET bearer token", () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect(isAuthorizedCronRequest("Bearer cron-secret")).toBe(true);
    expect(isAuthorizedCronRequest("Bearer wrong")).toBe(false);
    expect(isAuthorizedCronRequest(null)).toBe(false);
  });

  it("falls back to NEXTAUTH_SECRET when CRON_SECRET is unset", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "auth-secret");
    expect(isAuthorizedCronRequest("Bearer auth-secret")).toBe(true);
  });

  it('refuses everything — including "Bearer undefined" — when no secret is set', () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(isAuthorizedCronRequest("Bearer undefined")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer ")).toBe(false);
  });
});

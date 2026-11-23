/**
 * Create or reset the Meta App Review demo account (GUIA_META_APP_REVIEW.md).
 *
 *   npm run review-account -- --email reviewer@yourdomain.com --password 'a long password'
 *
 * Creates (or resets) a customer with that e-mail and password, e-mail already
 * confirmed, workspace ACTIVE, and in it one automation per channel (Comments
 * with keyword LINK, Stories replies, Direct with keyword PRICE), in "Direct"
 * mode without "Require follow", plus a few sample entries in DM Logs.
 *
 * For App Review the reviewer account stays without Instagram (the screencast
 * shows the full flow in the owner's own workspace). If an Instagram account is
 * connected to it, it is kept and its automations are recreated. Or pass a
 * token to connect one from here:
 *
 *   npm run review-account -- --email ... --password ... \
 *     --instagram-id 1784... --instagram-token EAA...
 *
 * Options: --link <url> (where the link button leads; default: the app's home
 * page), --no-sample-logs. Reads DATABASE_URL, ENCRYPTION_KEY and the Meta
 * settings from .env (when the file exists) or from the environment.
 */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) flags[name] = true;
    else flags[name] = argv[++i];
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const email = typeof flags.email === "string" ? flags.email : "";
  const password = typeof flags.password === "string" ? flags.password : "";
  if (!email || !password) {
    console.error("Usage: npm run review-account -- --email <e-mail> --password <password> [--instagram-token <token>] [--link <url>] [--no-sample-logs]");
    process.exit(1);
  }

  const { prisma } = await import("@/lib/db/client");
  const { validateNewPassword } = await import("@/lib/account/password");
  const { getBaseUrl } = await import("@/lib/env");
  const { resetReviewAccount } = await import("@/lib/review/demo-account");

  const invalid = validateNewPassword(password, email);
  if (invalid) {
    console.error(invalid);
    process.exit(1);
  }

  let instagram: Parameters<typeof resetReviewAccount>[1]["instagram"];
  if (typeof flags["instagram-token"] === "string") {
    // An Instagram User token (App Dashboard → Instagram → API setup with
    // Instagram login → Generate token): valid 60 days, renewed by the
    // token refresh cron like any connected account.
    const { getUserInfo } = await import("@/lib/meta/client");
    const { encryptToken } = await import("@/lib/meta/oauth");
    const auth = { accessToken: flags["instagram-token"] };
    const info = await getUserInfo(auth);
    // Webhooks name the account by its professional id (user_id), not the
    // app-scoped `id`.
    const instagramId = info.user_id ?? info.id;
    const { subscribeAndCheckWebhooks } = await import("@/lib/instagram/webhook-check");
    const check = await subscribeAndCheckWebhooks({ instagramId, username: info.username, auth, workspaceId: null });
    const webhookSubscribed = check.subscribed === true;
    if (!check.ok) console.warn("Instagram notifications not fully confirmed by Meta (see /admin → Diagnostics):", check.subscribeError ?? check.checkError ?? `missing ${check.missing.join(", ")}`);
    instagram = {
      id: instagramId,
      scopedId: info.id !== instagramId ? info.id : null,
      username: info.username,
      name: info.name ?? null,
      encryptedToken: encryptToken(auth.accessToken),
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 3600_000),
      webhookSubscribed,
    };
  }

  const result = await resetReviewAccount(prisma, {
    email,
    password,
    linkUrl: typeof flags.link === "string" ? flags.link : getBaseUrl(),
    sampleLogs: !flags["no-sample-logs"],
    instagram,
  });

  console.log(`Reviewer: ${email} (e-mail confirmed, workspace active)`);
  console.log(`Sign in at: ${getBaseUrl()}/login`);
  if (result.instagram) {
    console.log(`Instagram: @${result.instagram.username}`);
    for (const automation of result.automations) console.log(`  automation: ${automation.name} (${automation.type})`);
    console.log(`Sample log entries: ${result.sampleLogs}`);
  } else {
    // As intended for App Review: the reviewer sees the dashboard and the
    // connection screen; the full flow with a real account is in the screencast.
    console.log("No Instagram account connected (as intended for App Review: the test login shows the dashboard and the connection screen).");
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

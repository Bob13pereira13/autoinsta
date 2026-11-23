import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  parseCommentEvents,
  verifyWebhookSignature,
  verifyWebhookVerifyToken,
} from "@/lib/meta/webhook";
import { processInstagramWebhook } from "@/lib/queue/process-webhook";
import { describeWebhook, recordWebhookReceipt } from "@/lib/webhooks/receipts";

/**
 * The instagramIds of connected accounts among a payload's entry ids, the same
 * match processInstagramWebhook makes (anything else is discarded there).
 */
async function knownAccountIds(payload: unknown): Promise<Set<string>> {
  const entries = (payload as { entry?: unknown })?.entry;
  const ids = Array.isArray(entries)
    ? entries.map((e) => (e && typeof e === "object" && "id" in e ? String((e as { id: unknown }).id) : null)).filter((id): id is string => Boolean(id))
    : [];
  if (!ids.length) return new Set();
  const accounts = await prisma.instagramAccount.findMany({ where: { instagramId: { in: ids }, provider: "META" }, select: { instagramId: true } });
  return new Set(accounts.map((a) => a.instagramId));
}


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && verifyWebhookVerifyToken(token)) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json(
    { success: false, error: "Verification failed" },
    { status: 403 }
  );
}

export async function POST(request: NextRequest) {
  // Meta signs the exact bytes it sent, so verify against the raw body before
  // decoding it.
  const rawBytes = Buffer.from(await request.arrayBuffer());
  const rawBody = rawBytes.toString("utf8");
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(rawBytes, signature)) {
    // Record the attempt so a signature mismatch is visible rather than a
    // silent 401. This is the common symptom of INSTAGRAM_APP_SECRET (or
    // FACEBOOK_APP_SECRET) holding another app's secret.
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "WARNING",
          message: "Webhook signature verification failed",
          // No body preview: an unverified payload may carry personal data
          // (comment text, usernames) from a request we did not accept.
          payload: {
            hadSignatureHeader: Boolean(signature),
            bodyLength: rawBytes.length,
          },
        },
      })
      .catch(() => {});
    return NextResponse.json(
      { success: false, error: "Invalid signature" },
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await recordWebhookReceipt({ object: null, accepted: false, reason: "invalid_json", entries: [] });
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  // What arrived and what happens to it, for the admin's Diagnostics (24 h):
  // tells "Meta does not send it" from "the app discards it". No message text,
  // no ids of people (lib/webhooks/receipts.ts).
  await recordWebhookReceipt(describeWebhook(payload, await knownAccountIds(payload).catch(() => new Set<string>())));

  try {
    await processInstagramWebhook({ payload: payload as Parameters<typeof parseCommentEvents>[0], provider: 'META' });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Webhook processing failed' }, { status: 500 });
  }
}

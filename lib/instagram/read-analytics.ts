import * as meta from "@/lib/meta/client";
import { zernioRequest } from "@/lib/zernio/client";
import type { InstagramContext } from "./context";

export async function getUserFollowStatus({
  context,
  recipientId,
}: {
  context: InstagramContext;
  recipientId: string;
}): Promise<boolean | null> {
  if (context.provider === "META")
    return meta.getUserFollowStatus(context, recipientId);
  try {
    const result = await zernioRequest<{ isFollower: boolean | null }>({
      apiKey: context.apiKey,
      path: `/accounts/${encodeURIComponent(context.accountId)}/follow-status/${encodeURIComponent(recipientId)}?refresh=true`,
    });
    return typeof result.isFollower === "boolean" ? result.isFollower : null;
  } catch {
    return null;
  }
}

/**
 * The handle behind an IGSID. Zernio exposes no equivalent lookup, so a Zernio
 * account gets null and the message renders its fallback, as it does today.
 */
export async function getRecipientUsername({
  context,
  recipientId,
}: {
  context: InstagramContext;
  recipientId: string;
}): Promise<string | null> {
  if (context.provider === "META")
    return meta.getUserUsername(context, recipientId);
  return null;
}

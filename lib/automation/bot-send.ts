import * as provider from "@/lib/instagram/provider";
import { recordBotMessage } from "@/lib/automation/guards";

/**
 * The provider's send functions, plus bookkeeping of the message id each send
 * returns. Only the automations (the worker) send through here: an echo whose
 * id is recorded is the bot's own, any other echo was written by a person.
 */

function messageIdOf(result: unknown): string | null {
  if (result && typeof result === "object" && "message_id" in result) {
    const id = (result as { message_id?: unknown }).message_id;
    return typeof id === "string" && id ? id : null;
  }
  return null;
}

async function recorded<T>(
  send: Promise<T>,
  instagramId: string,
  recipientId: string | null
): Promise<T> {
  const result = await send;
  await recordBotMessage({ messageId: messageIdOf(result), instagramId, recipientId });
  return result;
}

type Args<F extends (args: never) => unknown> = Parameters<F>[0];

export const sendPrivateReply = (args: Args<typeof provider.sendPrivateReply>) =>
  recorded(provider.sendPrivateReply(args), args.instagramAccountId, null);

export const sendPrivateReplyWithButton = (args: Args<typeof provider.sendPrivateReplyWithButton>) =>
  recorded(provider.sendPrivateReplyWithButton(args), args.instagramAccountId, null);

export const sendPrivateReplyWithLinkButton = (args: Args<typeof provider.sendPrivateReplyWithLinkButton>) =>
  recorded(provider.sendPrivateReplyWithLinkButton(args), args.instagramAccountId, null);

export const sendDirectMessage = (args: Args<typeof provider.sendDirectMessage>) =>
  recorded(provider.sendDirectMessage(args), args.instagramAccountId, args.userId);

export const sendDirectMessageWithButton = (args: Args<typeof provider.sendDirectMessageWithButton>) =>
  recorded(provider.sendDirectMessageWithButton(args), args.instagramAccountId, args.userId);

export const sendDirectMessageWithLinkButton = (args: Args<typeof provider.sendDirectMessageWithLinkButton>) =>
  recorded(provider.sendDirectMessageWithLinkButton(args), args.instagramAccountId, args.userId);

export const sendDirectAttachment = (args: Args<typeof provider.sendDirectAttachment>) =>
  recorded(provider.sendDirectAttachment(args), args.instagramAccountId, args.userId);

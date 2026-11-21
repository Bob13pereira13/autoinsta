import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { MEDIA_SLOTS, type MediaSlotName } from "@/lib/automation/rules";

/** What the editor sends: uploaded media ids, the message they go with, order. */
export const mediaInputSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      slot: z.enum(MEDIA_SLOTS),
      position: z.number().int().min(0).max(100).optional(),
    })
  )
  .max(18);
export type MediaInput = z.infer<typeof mediaInputSchema>;

export class MediaAttachError extends Error {}

/**
 * Look up the requested media: each must belong to the workspace and be either
 * a fresh upload or already attached to this automation.
 */
export async function resolveMediaInput(
  workspaceId: string,
  automationId: string | null,
  items: MediaInput
): Promise<Array<{ id: string; slot: MediaSlotName; kind: "IMAGE" | "VIDEO"; position: number }>> {
  if (items.length === 0) return [];
  const rows = await prisma.automationMedia.findMany({
    where: {
      id: { in: items.map((i) => i.id) },
      workspaceId,
      OR: [{ automationId: null }, ...(automationId ? [{ automationId }] : [])],
    },
    select: { id: true, kind: true },
  });
  const kinds = new Map(rows.map((r) => [r.id, r.kind]));
  return items.map((item, index) => {
    const kind = kinds.get(item.id);
    if (!kind) throw new MediaAttachError("Media not found");
    return { id: item.id, slot: item.slot, kind, position: item.position ?? index };
  });
}

/**
 * Make the automation's media exactly `items` (for the enabled slots). Returns
 * the storage keys of files that were removed, to delete after the commit.
 */
export async function syncAutomationMedia(
  tx: Prisma.TransactionClient,
  {
    automationId,
    workspaceId,
    items,
    enabledSlots,
  }: {
    automationId: string;
    workspaceId: string;
    items: Array<{ id: string; slot: MediaSlotName; position: number }>;
    enabledSlots: Set<MediaSlotName>;
  }
): Promise<string[]> {
  const kept = items.filter((item) => enabledSlots.has(item.slot));
  const removed = await tx.automationMedia.findMany({
    where: { automationId, id: { notIn: kept.map((i) => i.id) } },
    select: { id: true, storageKey: true },
  });
  if (removed.length) {
    await tx.automationMedia.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
  }
  for (const item of kept) {
    await tx.automationMedia.updateMany({
      where: { id: item.id, workspaceId },
      data: { automationId, slot: item.slot, position: item.position },
    });
  }
  // Fresh uploads listed for a disabled slot are not attached; the daily purge
  // removes them.
  return removed.map((r) => r.storageKey);
}

export function enabledMediaSlots(data: { requireFollow?: boolean; followUpEnabled?: boolean }): Set<MediaSlotName> {
  const slots = new Set<MediaSlotName>(["MAIN"]);
  if (data.requireFollow) slots.add("FOLLOW_PROMPT");
  if (data.followUpEnabled) slots.add("FOLLOW_UP");
  return slots;
}
